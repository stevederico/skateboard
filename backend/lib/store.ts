/**
 * LRU eviction helper that removes oldest entries when over limit
 *
 * Prevents memory leaks in in-memory stores by removing the oldest entries
 * (by timestamp) when the store exceeds maxEntries. Selects the entries to
 * drop with a bounded max-heap in O(n log k) — where k is the number over
 * the limit — instead of sorting the entire store (O(n log n)), so cleanup
 * cost stays low when the store is only slightly over capacity.
 *
 * @param store - Map to evict entries from
 * @param maxEntries - Maximum entries before eviction
 * @param getTimestamp - Function to extract timestamp from value
 */
export function evictOldestEntries<K, V>(store: Map<K, V>, maxEntries: number, getTimestamp: (value: V) => number): void {
  const removeCount = store.size - maxEntries;
  if (removeCount <= 0) return;

  // Max-heap of the `removeCount` smallest timestamps seen so far. The root is
  // the largest among them, so any newer-than-root entry can be skipped and any
  // older entry replaces the root. heap.length never exceeds removeCount.
  const heap: { key: K; timestamp: number }[] = [];

  const siftUp = (start: number): void => {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].timestamp >= heap[i].timestamp) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };

  const siftDown = (start: number): void => {
    let i = start;
    const size = heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let largest = i;
      if (left < size && heap[left].timestamp > heap[largest].timestamp) largest = left;
      if (right < size && heap[right].timestamp > heap[largest].timestamp) largest = right;
      if (largest === i) break;
      [heap[largest], heap[i]] = [heap[i], heap[largest]];
      i = largest;
    }
  };

  for (const [key, value] of store) {
    const timestamp = getTimestamp(value);
    if (heap.length < removeCount) {
      heap.push({ key, timestamp });
      siftUp(heap.length - 1);
    } else if (timestamp < heap[0].timestamp) {
      heap[0] = { key, timestamp };
      siftDown(0);
    }
  }

  for (const entry of heap) {
    store.delete(entry.key);
  }
}
