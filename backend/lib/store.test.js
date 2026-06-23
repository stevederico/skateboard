import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evictOldestEntries } from './store.ts';

describe('store.js', () => {
  describe('evictOldestEntries', () => {
    it('does nothing when store is within limit', () => {
      const store = new Map([
        ['a', { ts: 1 }],
        ['b', { ts: 2 }],
      ]);
      evictOldestEntries(store, 3, (v) => v.ts);
      assert.equal(store.size, 2);
    });

    it('removes oldest entries when over limit', () => {
      const store = new Map([
        ['old', { ts: 1 }],
        ['mid', { ts: 5 }],
        ['new', { ts: 10 }],
        ['newer', { ts: 20 }],
      ]);
      evictOldestEntries(store, 2, (v) => v.ts);
      assert.equal(store.size, 2);
      assert.ok(!store.has('old'));
      assert.ok(!store.has('mid'));
      assert.ok(store.has('new'));
      assert.ok(store.has('newer'));
    });

    it('removes only the single oldest when one over the limit', () => {
      const store = new Map([
        ['c', { ts: 30 }],
        ['a', { ts: 10 }],
        ['b', { ts: 20 }],
      ]);
      evictOldestEntries(store, 2, (v) => v.ts);
      assert.equal(store.size, 2);
      assert.ok(!store.has('a'));
      assert.ok(store.has('b'));
      assert.ok(store.has('c'));
    });

    it('keeps the newest entries regardless of insertion order (heap selection)', () => {
      // Timestamps deliberately out of insertion order to exercise the heap.
      const store = new Map([
        ['k0', { ts: 50 }],
        ['k1', { ts: 5 }],
        ['k2', { ts: 90 }],
        ['k3', { ts: 15 }],
        ['k4', { ts: 70 }],
        ['k5', { ts: 1 }],
      ]);
      evictOldestEntries(store, 3, (v) => v.ts);
      assert.equal(store.size, 3);
      // Three oldest (ts 1, 5, 15) evicted; three newest (50, 70, 90) kept.
      assert.deepEqual([...store.keys()].sort(), ['k0', 'k2', 'k4']);
    });
  });
});