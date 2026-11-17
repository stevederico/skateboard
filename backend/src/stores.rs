use std::collections::HashMap;
use std::sync::Mutex;

pub const CSRF_TOKEN_EXPIRY_MS: i64 = 24 * 60 * 60 * 1000;
pub const LOCKOUT_THRESHOLD: u32 = 5;
pub const LOCKOUT_DURATION_MS: i64 = 15 * 60 * 1000;
pub const LOCKOUT_MAX_ENTRIES: usize = 50_000;
pub const LOCKOUT_ATTEMPT_WINDOW_MS: i64 = 15 * 60 * 1000;

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

#[derive(Debug, Clone, PartialEq)]
pub struct LoginAttempt {
    pub attempts: u32,
    pub locked_until: Option<i64>,
    pub last_attempt: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LockStatus {
    pub locked: bool,
    pub remaining_time: i64,
}

#[derive(Default)]
pub struct LockoutStore {
    inner: Mutex<HashMap<(String, String), LoginAttempt>>,
}

impl LockoutStore {
    pub fn new() -> LockoutStore {
        LockoutStore { inner: Mutex::new(HashMap::new()) }
    }

    pub fn is_locked(&self, email: &str, peer_ip: &str, now_ms: i64) -> LockStatus {
        let key = Self::key(email, peer_ip);
        let mut map = self.lock();
        let Some(record) = map.get(&key).cloned() else {
            return LockStatus { locked: false, remaining_time: 0 };
        };
        match record.locked_until {
            Some(until) if now_ms < until => LockStatus {
                locked: true,
                remaining_time: (until - now_ms + 999) / 1000,
            },
            Some(_) => {
                map.remove(&key);
                LockStatus { locked: false, remaining_time: 0 }
            }
            None => LockStatus { locked: false, remaining_time: 0 },
        }
    }

    pub fn record_failure(&self, email: &str, peer_ip: &str, now_ms: i64) -> bool {
        let key = Self::key(email, peer_ip);
        let mut map = self.lock();
        if !map.contains_key(&key) {
            Self::make_room(&mut map);
        }
        let record = map.entry(key).or_insert(LoginAttempt {
            attempts: 0,
            locked_until: None,
            last_attempt: now_ms,
        });
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

    pub fn clear(&self, email: &str, peer_ip: &str) {
        self.lock().remove(&Self::key(email, peer_ip));
    }

    pub fn len(&self) -> usize {
        self.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

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

    fn key(email: &str, peer_ip: &str) -> (String, String) {
        (email.to_string(), peer_ip.to_string())
    }

    fn make_room(map: &mut HashMap<(String, String), LoginAttempt>) {
        if map.len() >= LOCKOUT_MAX_ENTRIES {
            Self::evict(map, LOCKOUT_MAX_ENTRIES.saturating_sub(1));
        }
    }

    fn evict(map: &mut HashMap<(String, String), LoginAttempt>, max_entries: usize) {
        evict_oldest_entries(map, max_entries, |r| {
            r.locked_until.unwrap_or(r.last_attempt)
        });
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<(String, String), LoginAttempt>> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

pub const AUTH_RATE_WINDOW_MS: i64 = 15 * 60 * 1000;
pub const AUTH_RATE_LIMIT: usize = 20;
pub const AUTH_RATE_MAX_ENTRIES: usize = 50_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RateLimitStatus {
    pub limited: bool,
    pub retry_after_secs: i64,
}

#[derive(Default)]
pub struct RateLimitStore {
    inner: Mutex<HashMap<String, Vec<i64>>>,
}

impl RateLimitStore {
    pub fn new() -> RateLimitStore {
        RateLimitStore {
            inner: Mutex::new(HashMap::new()),
        }
    }

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
        map.insert(
            ("locked@b.co".into(), IP.into()),
            LoginAttempt {
                attempts: LOCKOUT_THRESHOLD,
                locked_until: Some(1_000_000),
                last_attempt: 10,
            },
        );
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

    #[test]
    fn record_failure_keeps_the_map_bounded_without_a_cleanup_pass() {
        let s = LockoutStore::new();
        for i in 0..LOCKOUT_MAX_ENTRIES + 25 {
            s.record_failure(&format!("u{i}@b.co"), IP, i as i64);
        }
        assert!(s.len() <= LOCKOUT_MAX_ENTRIES, "{} entries", s.len());
    }
}
