//! In-memory CSRF and account-lockout stores with bounded capacity.
//!
//! Zero-crate port of the `csrfTokenStore` / `loginAttemptStore` maps and
//! `lib/store.ts`'s `evictOldestEntries`. The Node versions live on a
//! single-threaded event loop; these are shared across worker threads, so each
//! store owns a `Mutex`.

use std::collections::HashMap;
use std::sync::Mutex;

/// CSRF token lifetime in milliseconds (24 hours).
pub const CSRF_TOKEN_EXPIRY_MS: i64 = 24 * 60 * 60 * 1000;
/// Capacity at which the oldest CSRF entries are evicted.
pub const CSRF_MAX_ENTRIES: usize = 50_000;
/// Failed sign-ins before an account is locked.
pub const LOCKOUT_THRESHOLD: u32 = 5;
/// Lockout duration in milliseconds (15 minutes).
pub const LOCKOUT_DURATION_MS: i64 = 15 * 60 * 1000;
/// Capacity at which the oldest lockout entries are evicted.
pub const LOCKOUT_MAX_ENTRIES: usize = 50_000;

/// Drop the oldest entries until `store` holds at most `max_entries`.
///
/// "Oldest" is by the timestamp `get_timestamp` extracts. Selection uses a
/// bounded max-heap so cost is O(n log k) in the number over the limit, rather
/// than sorting the whole map — the same strategy as `evictOldestEntries`.
pub fn evict_oldest_entries<K, V>(
    store: &mut HashMap<K, V>,
    max_entries: usize,
    get_timestamp: impl Fn(&V) -> i64,
) where
    K: std::hash::Hash + Eq + Clone,
{
    let Some(remove_count) = store.len().checked_sub(max_entries).filter(|n| *n > 0) else {
        return;
    };

    // Max-heap of the `remove_count` smallest timestamps seen so far; the root
    // is the largest among them, so a newer entry is skipped and an older one
    // replaces the root.
    let mut heap: Vec<(K, i64)> = Vec::with_capacity(remove_count);
    for (k, v) in store.iter() {
        let ts = get_timestamp(v);
        if heap.len() < remove_count {
            heap.push((k.clone(), ts));
            let idx = heap.len() - 1;
            sift_up(&mut heap, idx);
        } else if ts < heap[0].1 {
            heap[0] = (k.clone(), ts);
            sift_down(&mut heap, 0);
        }
    }
    for (k, _) in heap {
        store.remove(&k);
    }
}

fn sift_up<K>(heap: &mut [(K, i64)], start: usize) {
    let mut i = start;
    while i > 0 {
        let parent = (i - 1) / 2;
        if heap[parent].1 >= heap[i].1 {
            break;
        }
        heap.swap(parent, i);
        i = parent;
    }
}

fn sift_down<K>(heap: &mut [(K, i64)], start: usize) {
    let mut i = start;
    let size = heap.len();
    loop {
        let left = 2 * i + 1;
        let right = left + 1;
        let mut largest = i;
        if left < size && heap[left].1 > heap[largest].1 {
            largest = left;
        }
        if right < size && heap[right].1 > heap[largest].1 {
            largest = right;
        }
        if largest == i {
            break;
        }
        heap.swap(largest, i);
        i = largest;
    }
}

/// A CSRF token and the epoch-milliseconds it was issued.
#[derive(Debug, Clone, PartialEq)]
pub struct CsrfEntry {
    /// The 64-character hex token.
    pub token: String,
    /// Issue time in epoch milliseconds.
    pub timestamp: i64,
}

/// Per-user CSRF token store.
#[derive(Default)]
pub struct CsrfStore {
    inner: Mutex<HashMap<String, CsrfEntry>>,
}

impl CsrfStore {
    /// Create an empty store.
    pub fn new() -> CsrfStore {
        CsrfStore { inner: Mutex::new(HashMap::new()) }
    }

    /// Read the entry for a user, if any.
    pub fn get(&self, user_id: &str) -> Option<CsrfEntry> {
        self.lock().get(user_id).cloned()
    }

    /// Store (or replace) a user's token, stamped `now_ms`.
    pub fn set(&self, user_id: &str, token: String, now_ms: i64) {
        self.lock().insert(user_id.to_string(), CsrfEntry { token, timestamp: now_ms });
    }

    /// Forget a user's token (sign-out).
    pub fn remove(&self, user_id: &str) {
        self.lock().remove(user_id);
    }

    /// Number of stored tokens.
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    /// Whether the store holds no tokens.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Drop expired tokens, then evict down to [`CSRF_MAX_ENTRIES`].
    ///
    /// Returns how many were dropped for expiry.
    pub fn cleanup(&self, now_ms: i64) -> usize {
        let mut map = self.lock();
        let before = map.len();
        map.retain(|_, e| now_ms - e.timestamp <= CSRF_TOKEN_EXPIRY_MS);
        let cleaned = before - map.len();
        evict_oldest_entries(&mut map, CSRF_MAX_ENTRIES, |e| e.timestamp);
        cleaned
    }

    /// Recover from a poisoned mutex rather than propagating a panic: a
    /// half-updated token map is still safe to use, and losing the CSRF store
    /// would sign every user out.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, CsrfEntry>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Failed-login counter for one email.
#[derive(Debug, Clone, PartialEq)]
pub struct LoginAttempt {
    /// Consecutive failures.
    pub attempts: u32,
    /// Epoch milliseconds the lock expires, when locked.
    pub locked_until: Option<i64>,
}

/// Outcome of a lockout check.
#[derive(Debug, Clone, PartialEq)]
pub struct LockStatus {
    /// Whether the account is currently locked.
    pub locked: bool,
    /// Seconds until the lock expires, rounded up.
    pub remaining_time: i64,
}

/// Per-email failed-login store implementing temporary account lockout.
#[derive(Default)]
pub struct LockoutStore {
    inner: Mutex<HashMap<String, LoginAttempt>>,
}

impl LockoutStore {
    /// Create an empty store.
    pub fn new() -> LockoutStore {
        LockoutStore { inner: Mutex::new(HashMap::new()) }
    }

    /// Check whether an email is locked, clearing an expired lock as a side
    /// effect — matching `isAccountLocked`.
    pub fn is_locked(&self, email: &str, now_ms: i64) -> LockStatus {
        let mut map = self.lock();
        let Some(record) = map.get(email).cloned() else {
            return LockStatus { locked: false, remaining_time: 0 };
        };
        match record.locked_until {
            Some(until) if now_ms < until => LockStatus {
                locked: true,
                // Node uses Math.ceil on the millisecond remainder.
                remaining_time: (until - now_ms + 999) / 1000,
            },
            Some(_) => {
                map.remove(email);
                LockStatus { locked: false, remaining_time: 0 }
            }
            None => LockStatus { locked: false, remaining_time: 0 },
        }
    }

    /// Record a failed sign-in, locking the account at [`LOCKOUT_THRESHOLD`].
    ///
    /// Returns whether this attempt tripped or extended the lock.
    pub fn record_failure(&self, email: &str, now_ms: i64) -> bool {
        let mut map = self.lock();
        let record = map
            .entry(email.to_string())
            .or_insert(LoginAttempt { attempts: 0, locked_until: None });
        record.attempts += 1;
        if record.attempts >= LOCKOUT_THRESHOLD {
            record.locked_until = Some(now_ms + LOCKOUT_DURATION_MS);
            return true;
        }
        false
    }

    /// Clear an email's failure record after a successful sign-in.
    pub fn clear(&self, email: &str) {
        self.lock().remove(email);
    }

    /// Number of tracked emails.
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    /// Whether the store holds no records.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Drop expired locks, then evict down to [`LOCKOUT_MAX_ENTRIES`].
    ///
    /// Returns how many were dropped for expiry.
    pub fn cleanup(&self, now_ms: i64) -> usize {
        let mut map = self.lock();
        let before = map.len();
        map.retain(|_, r| !matches!(r.locked_until, Some(until) if now_ms >= until));
        let cleaned = before - map.len();
        evict_oldest_entries(&mut map, LOCKOUT_MAX_ENTRIES, |r| r.locked_until.unwrap_or(0));
        cleaned
    }

    /// See [`CsrfStore::lock`] for why poisoning is recovered rather than
    /// propagated.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, LoginAttempt>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evicts_only_the_overflow_and_picks_the_oldest() {
        let mut m: HashMap<i32, i64> = (0..10).map(|k| (k, i64::from(k))).collect();
        evict_oldest_entries(&mut m, 4, |v| *v);
        assert_eq!(m.len(), 4);
        // The six smallest timestamps (0..=5) are gone.
        for k in 0..6 {
            assert!(!m.contains_key(&k), "{k} should have been evicted");
        }
        for k in 6..10 {
            assert!(m.contains_key(&k), "{k} should have been kept");
        }
    }

    #[test]
    fn eviction_is_a_noop_under_capacity() {
        let mut m: HashMap<i32, i64> = (0..3).map(|k| (k, i64::from(k))).collect();
        evict_oldest_entries(&mut m, 10, |v| *v);
        assert_eq!(m.len(), 3);
    }

    #[test]
    fn csrf_cleanup_drops_expired_only() {
        let s = CsrfStore::new();
        s.set("old", "a".into(), 0);
        s.set("new", "b".into(), CSRF_TOKEN_EXPIRY_MS);
        let cleaned = s.cleanup(CSRF_TOKEN_EXPIRY_MS + 1);
        assert_eq!(cleaned, 1);
        assert!(s.get("old").is_none());
        assert!(s.get("new").is_some());
    }

    #[test]
    fn lockout_trips_at_threshold() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD - 1 {
            assert!(!s.record_failure("a@b.co", 0));
        }
        assert!(s.record_failure("a@b.co", 0));
        let st = s.is_locked("a@b.co", 0);
        assert!(st.locked);
        assert_eq!(st.remaining_time, LOCKOUT_DURATION_MS / 1000);
    }

    #[test]
    fn lockout_expires_and_clears() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD {
            s.record_failure("a@b.co", 0);
        }
        assert!(!s.is_locked("a@b.co", LOCKOUT_DURATION_MS).locked);
        assert_eq!(s.len(), 0, "expired lock should be cleared on check");
    }

    #[test]
    fn remaining_time_rounds_up() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD {
            s.record_failure("a@b.co", 0);
        }
        // 1 ms into the window leaves 899_999 ms → 900 s after ceil.
        assert_eq!(s.is_locked("a@b.co", 1).remaining_time, 900);
    }

    #[test]
    fn clear_resets_attempts() {
        let s = LockoutStore::new();
        s.record_failure("a@b.co", 0);
        s.clear("a@b.co");
        assert!(s.is_empty());
    }
}
