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
/// How long a failed attempt counts toward the threshold (15 minutes).
///
/// Without a window, failures accumulate for the lifetime of the process: four
/// typos spread over months would leave an account one mistake from a lockout.
pub const LOCKOUT_ATTEMPT_WINDOW_MS: i64 = 15 * 60 * 1000;

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

/// Failed-login counter for one (email, IP) pair.
#[derive(Debug, Clone, PartialEq)]
pub struct LoginAttempt {
    /// Consecutive failures within [`LOCKOUT_ATTEMPT_WINDOW_MS`].
    pub attempts: u32,
    /// Epoch milliseconds the lock expires, when locked.
    pub locked_until: Option<i64>,
    /// Epoch milliseconds of the most recent failure, used to expire the
    /// counter and to choose eviction victims.
    pub last_attempt: i64,
}

/// Outcome of a lockout check.
#[derive(Debug, Clone, PartialEq)]
pub struct LockStatus {
    /// Whether the account is currently locked.
    pub locked: bool,
    /// Seconds until the lock expires, rounded up.
    pub remaining_time: i64,
}

/// Failed-login store implementing temporary lockout, keyed per (email, IP).
///
/// Keying on the email alone — as this did originally — makes the lockout a
/// weapon: anyone who knows an address can send [`LOCKOUT_THRESHOLD`] wrong
/// passwords and lock the real owner out for [`LOCKOUT_DURATION_MS`], from
/// anywhere, repeatedly. Including the source address confines a lockout to the
/// client that earned it, so an attacker can only lock themselves out.
///
/// The cost is that a distributed attacker gets the threshold once per source
/// address against a single account. That is deliberately not solved here: an
/// account-wide counter would restore the very denial-of-service this avoids.
/// Distributed guessing needs a global request rate limit, which is a separate
/// control this server does not yet have.
#[derive(Default)]
pub struct LockoutStore {
    inner: Mutex<HashMap<(String, String), LoginAttempt>>,
}

impl LockoutStore {
    /// Create an empty store.
    pub fn new() -> LockoutStore {
        LockoutStore { inner: Mutex::new(HashMap::new()) }
    }

    /// Check whether this email is locked for this client address, clearing an
    /// expired lock as a side effect.
    ///
    /// # Arguments
    ///
    /// * `email` - Address being signed in to.
    /// * `peer_ip` - Client address from the socket, never from a header.
    /// * `now_ms` - Current time in epoch milliseconds.
    pub fn is_locked(&self, email: &str, peer_ip: &str, now_ms: i64) -> LockStatus {
        let key = Self::key(email, peer_ip);
        let mut map = self.lock();
        let Some(record) = map.get(&key).cloned() else {
            return LockStatus { locked: false, remaining_time: 0 };
        };
        match record.locked_until {
            Some(until) if now_ms < until => LockStatus {
                locked: true,
                // Node uses Math.ceil on the millisecond remainder.
                remaining_time: (until - now_ms + 999) / 1000,
            },
            Some(_) => {
                map.remove(&key);
                LockStatus { locked: false, remaining_time: 0 }
            }
            None => LockStatus { locked: false, remaining_time: 0 },
        }
    }

    /// Record a failed sign-in, locking at [`LOCKOUT_THRESHOLD`] consecutive
    /// failures within [`LOCKOUT_ATTEMPT_WINDOW_MS`].
    ///
    /// Returns whether this attempt tripped or extended the lock.
    pub fn record_failure(&self, email: &str, peer_ip: &str, now_ms: i64) -> bool {
        let key = Self::key(email, peer_ip);
        let mut map = self.lock();
        if !map.contains_key(&key) {
            // Bound the map on the way in. `cleanup` runs on a timer, so
            // relying on it alone lets a burst of distinct keys grow the map
            // without limit between ticks.
            Self::make_room(&mut map);
        }
        let record = map.entry(key).or_insert(LoginAttempt {
            attempts: 0,
            locked_until: None,
            last_attempt: now_ms,
        });
        // A failure older than the window no longer counts, so the streak
        // restarts at this attempt rather than building on stale history.
        if now_ms - record.last_attempt > LOCKOUT_ATTEMPT_WINDOW_MS {
            record.attempts = 0;
            record.locked_until = None;
        }
        record.attempts += 1;
        record.last_attempt = now_ms;
        if record.attempts >= LOCKOUT_THRESHOLD {
            record.locked_until = Some(now_ms + LOCKOUT_DURATION_MS);
            return true;
        }
        false
    }

    /// Clear the failure record for this email and address after a successful
    /// sign-in.
    pub fn clear(&self, email: &str, peer_ip: &str) {
        self.lock().remove(&Self::key(email, peer_ip));
    }

    /// Number of tracked (email, IP) pairs.
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    /// Whether the store holds no records.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Drop expired locks and stale counters, then evict down to
    /// [`LOCKOUT_MAX_ENTRIES`].
    ///
    /// Returns how many were dropped. Stale unlocked counters are included:
    /// they can never lock anyone again once outside the attempt window, so
    /// keeping them only grows the map.
    pub fn cleanup(&self, now_ms: i64) -> usize {
        let mut map = self.lock();
        let before = map.len();
        map.retain(|_, r| match r.locked_until {
            Some(until) => now_ms < until,
            None => now_ms - r.last_attempt <= LOCKOUT_ATTEMPT_WINDOW_MS,
        });
        let cleaned = before - map.len();
        Self::evict(&mut map, LOCKOUT_MAX_ENTRIES);
        cleaned
    }

    /// Composite key. Emails are already normalized to lowercase by the
    /// caller; the address is used verbatim.
    fn key(email: &str, peer_ip: &str) -> (String, String) {
        (email.to_string(), peer_ip.to_string())
    }

    /// Free one slot if the map is at capacity.
    fn make_room(map: &mut HashMap<(String, String), LoginAttempt>) {
        if map.len() >= LOCKOUT_MAX_ENTRIES {
            Self::evict(map, LOCKOUT_MAX_ENTRIES.saturating_sub(1));
        }
    }

    /// Evict down to `max_entries`, preferring records that are not locked.
    ///
    /// The ranking timestamp is `locked_until` when locked and `last_attempt`
    /// otherwise. Because a live `locked_until` is always in the future and
    /// every `last_attempt` is in the past, active locks sort last and are
    /// evicted only after every unlocked record is gone. That matters: if
    /// eviction could drop a live lock, flooding the map with junk keys would
    /// be a way to clear a lockout and resume guessing.
    fn evict(map: &mut HashMap<(String, String), LoginAttempt>, max_entries: usize) {
        evict_oldest_entries(map, max_entries, |r| {
            r.locked_until.unwrap_or(r.last_attempt)
        });
    }

    /// See [`CsrfStore::lock`] for why poisoning is recovered rather than
    /// propagated.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<(String, String), LoginAttempt>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Auth endpoint sliding-window size (15 minutes).
pub const AUTH_RATE_WINDOW_MS: i64 = 15 * 60 * 1000;
/// Max `/api/signup` + `/api/signin` requests per IP inside the window.
pub const AUTH_RATE_LIMIT: usize = 20;
/// Capacity at which the oldest IP windows are evicted.
pub const AUTH_RATE_MAX_ENTRIES: usize = 50_000;

/// Outcome of recording one auth request against the per-IP window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RateLimitStatus {
    /// Whether this request must be refused.
    pub limited: bool,
    /// Seconds until the oldest request in the window ages out (0 when allowed).
    pub retry_after_secs: i64,
}

/// Per-IP sliding window for `/api/signup` and `/api/signin`.
///
/// Complements [`LockoutStore`]: lockouts stop guessing against one account,
/// this stops one address from flooding many accounts or the signup path.
#[derive(Default)]
pub struct RateLimitStore {
    /// IP → request timestamps (epoch ms) inside the current window.
    inner: Mutex<HashMap<String, Vec<i64>>>,
}

impl RateLimitStore {
    /// Create an empty store.
    pub fn new() -> RateLimitStore {
        RateLimitStore {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Record a request for `ip` at `now_ms`.
    ///
    /// When the window already holds [`AUTH_RATE_LIMIT`] timestamps, the new
    /// request is refused and is **not** appended (so a flood cannot push the
    /// retry-after further out forever).
    pub fn check_and_record(&self, ip: &str, now_ms: i64) -> RateLimitStatus {
        let mut map = self.lock();
        let window_start = now_ms - AUTH_RATE_WINDOW_MS;
        if !map.contains_key(ip) && map.len() >= AUTH_RATE_MAX_ENTRIES {
            evict_oldest_entries(&mut map, AUTH_RATE_MAX_ENTRIES.saturating_sub(1), |times| {
                times.first().copied().unwrap_or(0)
            });
        }
        let times = map.entry(ip.to_string()).or_default();
        times.retain(|&t| t > window_start);
        if times.len() >= AUTH_RATE_LIMIT {
            let oldest = times.first().copied().unwrap_or(now_ms);
            let retry_after_secs = ((oldest + AUTH_RATE_WINDOW_MS) - now_ms + 999) / 1000;
            return RateLimitStatus {
                limited: true,
                retry_after_secs: retry_after_secs.max(1),
            };
        }
        times.push(now_ms);
        RateLimitStatus {
            limited: false,
            retry_after_secs: 0,
        }
    }

    /// Drop empty and fully-expired windows.
    pub fn cleanup(&self, now_ms: i64) -> usize {
        let mut map = self.lock();
        let before = map.len();
        let window_start = now_ms - AUTH_RATE_WINDOW_MS;
        map.retain(|_, times| {
            times.retain(|&t| t > window_start);
            !times.is_empty()
        });
        let cleaned = before - map.len();
        if map.len() > AUTH_RATE_MAX_ENTRIES {
            evict_oldest_entries(&mut map, AUTH_RATE_MAX_ENTRIES, |times| {
                times.first().copied().unwrap_or(0)
            });
        }
        cleaned
    }

    /// Number of tracked IPs.
    pub fn len(&self) -> usize {
        self.lock().len()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, Vec<i64>>> {
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

    const IP: &str = "203.0.113.7";

    #[test]
    fn lockout_trips_at_threshold() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD - 1 {
            assert!(!s.record_failure("a@b.co", IP, 0));
        }
        assert!(s.record_failure("a@b.co", IP, 0));
        let st = s.is_locked("a@b.co", IP, 0);
        assert!(st.locked);
        assert_eq!(st.remaining_time, LOCKOUT_DURATION_MS / 1000);
    }

    #[test]
    fn lockout_expires_and_clears() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD {
            s.record_failure("a@b.co", IP, 0);
        }
        assert!(!s.is_locked("a@b.co", IP, LOCKOUT_DURATION_MS).locked);
        assert_eq!(s.len(), 0, "expired lock should be cleared on check");
    }

    #[test]
    fn remaining_time_rounds_up() {
        let s = LockoutStore::new();
        for _ in 0..LOCKOUT_THRESHOLD {
            s.record_failure("a@b.co", IP, 0);
        }
        // 1 ms into the window leaves 899_999 ms, so 900 s after ceil.
        assert_eq!(s.is_locked("a@b.co", IP, 1).remaining_time, 900);
    }

    #[test]
    fn clear_resets_attempts() {
        let s = LockoutStore::new();
        s.record_failure("a@b.co", IP, 0);
        s.clear("a@b.co", IP);
        assert!(s.is_empty());
    }

    #[test]
    fn a_lockout_does_not_follow_the_account_to_another_address() {
        let s = LockoutStore::new();
        // An attacker burns the threshold against a known address.
        for _ in 0..LOCKOUT_THRESHOLD {
            s.record_failure("victim@b.co", "198.51.100.1", 0);
        }
        assert!(s.is_locked("victim@b.co", "198.51.100.1", 0).locked);
        assert!(
            !s.is_locked("victim@b.co", "203.0.113.9", 0).locked,
            "the real owner must still be able to sign in"
        );
    }

    #[test]
    fn attempts_outside_the_window_do_not_accumulate() {
        let s = LockoutStore::new();
        let mut now = 0;
        // One failure per window, forever, must never trip the lock.
        for _ in 0..LOCKOUT_THRESHOLD * 3 {
            assert!(!s.record_failure("a@b.co", IP, now));
            now += LOCKOUT_ATTEMPT_WINDOW_MS + 1;
        }
        assert!(!s.is_locked("a@b.co", IP, now).locked);
    }

    #[test]
    fn attempts_inside_the_window_still_accumulate() {
        let s = LockoutStore::new();
        let mut now = 0;
        for _ in 0..LOCKOUT_THRESHOLD - 1 {
            assert!(!s.record_failure("a@b.co", IP, now));
            now += LOCKOUT_ATTEMPT_WINDOW_MS - 1;
        }
        assert!(
            s.record_failure("a@b.co", IP, now),
            "failures spaced under the window must still reach the threshold"
        );
    }

    #[test]
    fn cleanup_drops_stale_counters_that_never_locked() {
        let s = LockoutStore::new();
        s.record_failure("stale@b.co", IP, 0);
        s.record_failure("fresh@b.co", IP, LOCKOUT_ATTEMPT_WINDOW_MS);
        let cleaned = s.cleanup(LOCKOUT_ATTEMPT_WINDOW_MS + 1);
        assert_eq!(cleaned, 1);
        assert_eq!(s.len(), 1);
    }

    #[test]
    fn eviction_sacrifices_unlocked_records_before_live_locks() {
        let mut map: HashMap<(String, String), LoginAttempt> = HashMap::new();
        // One live lock, expiring far in the future.
        map.insert(
            ("locked@b.co".into(), IP.into()),
            LoginAttempt {
                attempts: LOCKOUT_THRESHOLD,
                locked_until: Some(1_000_000),
                last_attempt: 10,
            },
        );
        // Newer, but unlocked: junk an attacker could flood the map with.
        for i in 0..5 {
            map.insert(
                (format!("junk{i}@b.co"), IP.into()),
                LoginAttempt {
                    attempts: 1,
                    locked_until: None,
                    last_attempt: 500 + i64::from(i),
                },
            );
        }
        LockoutStore::evict(&mut map, 1);
        assert_eq!(map.len(), 1);
        assert!(
            map.contains_key(&("locked@b.co".to_string(), IP.to_string())),
            "flooding the map must not be a way to clear a lockout"
        );
    }

    #[test]
    fn auth_rate_limit_allows_under_the_cap() {
        let s = RateLimitStore::new();
        for i in 0..AUTH_RATE_LIMIT {
            let st = s.check_and_record(IP, i as i64);
            assert!(!st.limited, "request {i} should be allowed");
        }
    }

    #[test]
    fn auth_rate_limit_trips_at_the_cap() {
        let s = RateLimitStore::new();
        for i in 0..AUTH_RATE_LIMIT {
            assert!(!s.check_and_record(IP, i as i64).limited);
        }
        let st = s.check_and_record(IP, AUTH_RATE_LIMIT as i64);
        assert!(st.limited);
        assert!(st.retry_after_secs >= 1);
    }

    #[test]
    fn auth_rate_limit_window_expiry_frees_a_slot() {
        let s = RateLimitStore::new();
        for i in 0..AUTH_RATE_LIMIT {
            assert!(!s.check_and_record(IP, i as i64).limited);
        }
        assert!(s.check_and_record(IP, AUTH_RATE_LIMIT as i64).limited);
        // Advance past the oldest timestamp's window.
        let later = AUTH_RATE_WINDOW_MS + 1;
        assert!(!s.check_and_record(IP, later).limited);
    }

    #[test]
    fn auth_rate_limit_cleanup_drops_empty_windows() {
        let s = RateLimitStore::new();
        s.check_and_record(IP, 0);
        assert_eq!(s.cleanup(AUTH_RATE_WINDOW_MS + 1), 1);
        assert_eq!(s.len(), 0);
    }
}
