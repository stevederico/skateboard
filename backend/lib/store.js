/**
 * LRU eviction helper that removes oldest entries when over limit
 *
 * Prevents memory leaks in in-memory stores by removing oldest entries based on
 * timestamp when store exceeds maxEntries threshold.
 *
 * @param {Map} store - Map to evict entries from
 * @param {number} maxEntries - Maximum entries before eviction
 * @param {Function} getTimestamp - Function to extract timestamp from value
 * @returns {void}
 */
export function evictOldestEntries(store, maxEntries, getTimestamp) {
  if (store.size <= maxEntries) return;

  // Convert to array and sort by timestamp
  const entries = Array.from(store.entries())
    .map(([key, value]) => ({ key, timestamp: getTimestamp(value) }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Remove oldest entries until under limit
  const toRemove = store.size - maxEntries;
  for (let i = 0; i < toRemove; i++) {
    store.delete(entries[i].key);
  }
}