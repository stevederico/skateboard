import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evictOldestEntries } from './store.js';

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
  });
});