import { describe, it, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PostgreSQLProvider, __setPgModuleLoaderForTests } from './postgres.ts';

const poolConfigs = [];
const poolInstances = [];
const clientQueries = [];

function createMockClient(handler) {
  const client = {
    query: mock.fn(async (sql, params = []) => {
      clientQueries.push({ sql, params });
      return handler(sql, params);
    }),
    release: mock.fn(),
  };
  return client;
}

class MockPool {
  constructor(config) {
    this.config = config;
    poolConfigs.push(config);
    poolInstances.push(this);
    this.connect = mock.fn(async () => this._client);
    this.end = mock.fn(async () => {});
    this._handler = async () => ({ rows: [], rowCount: 0 });
    this._client = createMockClient((sql, params) => this._handler(sql, params));
  }

  setHandler(handler) {
    this._handler = handler;
    this._client = createMockClient((sql, params) => handler(sql, params));
    this.connect = mock.fn(async () => this._client);
  }
}

// Inject a fake `pg` surface through the module loader seam instead of
// mock.module('pg') (which no longer applies under Node 24.14). The shape
// mirrors pg's CommonJS namespace: `default` carries module.exports.
__setPgModuleLoaderForTests(async () => ({
  default: {
    Pool: MockPool,
    types: {
      setTypeParser: () => {},
    },
  },
}));

describe('PostgreSQLProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new PostgreSQLProvider();
    poolConfigs.length = 0;
    poolInstances.length = 0;
    clientQueries.length = 0;
  });

  after(async () => {
    await provider?.closeAll?.();
  });

  it('initialize is a no-op', async () => {
    await provider.initialize();
  });

  describe('getDatabase', () => {
    it('throws when connection string is missing', async () => {
      await assert.rejects(
        () => provider.getDatabase('main'),
        /Connection string required/
      );
    });

    it('disables SSL for localhost', async () => {
      const pool = await provider.getDatabase('local', 'postgres://user:pass@localhost:5432/db');
      assert.equal(pool.config.ssl, false);
    });

    it('disables SSL for 127.0.0.1', async () => {
      await provider.getDatabase('loopback', 'postgres://user:pass@127.0.0.1:5432/db');
      assert.equal(poolConfigs.at(-1).ssl, false);
    });

    it('disables SSL for ::1 hostname', async () => {
      const OriginalURL = globalThis.URL;
      globalThis.URL = class extends OriginalURL {
        constructor(input, base) {
          super(input, base);
          if (String(input).includes('ipv6-loopback-test')) {
            Object.defineProperty(this, 'hostname', { value: '::1', configurable: true });
          }
        }
      };
      try {
        await provider.getDatabase('ipv6', 'postgres://user:pass@ipv6-loopback-test:5432/db');
        assert.equal(poolConfigs.at(-1).ssl, false);
      } finally {
        globalThis.URL = OriginalURL;
      }
    });

    it('keeps SSL enabled for bracketed IPv6 literal [::1]', async () => {
      await provider.getDatabase('ipv6-bracket', 'postgres://user:pass@[::1]:5432/db');
      assert.equal(poolConfigs.at(-1).ssl, true);
    });

    it('enables SSL for remote hosts', async () => {
      await provider.getDatabase('remote', 'postgres://user:pass@db.example.com:5432/db');
      assert.equal(poolConfigs.at(-1).ssl, true);
    });

    it('enables SSL when connection URL cannot be parsed', async () => {
      await provider.getDatabase('invalid-url', 'not-a-valid-url');
      assert.equal(poolConfigs.at(-1).ssl, true);
    });

    it('returns cached pool for the same db name', async () => {
      const first = await provider.getDatabase('cache', 'postgres://user:pass@localhost/db1');
      const second = await provider.getDatabase('cache', 'postgres://ignored/db2');
      assert.equal(first, second);
    });

    it('creates schema on first pool creation', async () => {
      const pool = await provider.getDatabase('schema', 'postgres://user:pass@localhost/db');
      pool.setHandler(async (sql) => {
        if (sql.includes('CREATE TABLE')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
      await provider.getDatabase('schema2', 'postgres://user:pass@localhost/db2');
      const schemaQueries = clientQueries.filter((q) => q.sql.includes('CREATE TABLE'));
      assert.ok(schemaQueries.length >= 3);
    });
  });

  describe('findUser', () => {
    let pool;

    beforeEach(async () => {
      pool = await provider.getDatabase('users', 'postgres://user:pass@localhost/users');
      pool.setHandler(async (sql) => {
        if (sql.startsWith('SELECT * FROM users')) {
          return {
            rows: [{
              _id: 'u1',
              email: 'user@example.com',
              name: 'User',
              created_at: 1000,
              subscription_stripeID: 'sub_1',
              subscription_expires: 2000,
              subscription_status: 'active',
              usage_count: 4,
              usage_reset_at: 3000,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });
    });

    it('finds by _id and transforms nested fields', async () => {
      const user = await provider.findUser(pool, { _id: 'u1' });
      assert.equal(user._id, 'u1');
      assert.deepEqual(user.subscription, { stripeID: 'sub_1', expires: 2000, status: 'active' });
      assert.deepEqual(user.usage, { count: 4, reset_at: 3000 });
    });

    it('finds by email', async () => {
      const user = await provider.findUser(pool, { email: 'user@example.com' });
      assert.equal(user.email, 'user@example.com');
    });

    it('returns null when query has neither _id nor email', async () => {
      const user = await provider.findUser(pool, {});
      assert.equal(user, null);
    });

    it('returns null when no rows are found', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 0 }));
      const user = await provider.findUser(pool, { _id: 'missing' });
      assert.equal(user, null);
    });

    it('preserves zero usage_reset_at values', async () => {
      const pool = await provider.getDatabase('usage-reset-zero', 'postgres://user:pass@localhost/usage-reset-zero');
      pool.setHandler(async () => ({
        rows: [{
          _id: 'ur0',
          email: 'ur0@example.com',
          name: 'UR0',
          created_at: 1,
          usage_count: 1,
          usage_reset_at: 0,
        }],
        rowCount: 1,
      }));
      const user = await provider.findUser(pool, { _id: 'ur0' });
      assert.equal(user.usage.reset_at, null);
    });

    it('maps zero usage_count without coercing to default', async () => {
      const pool = await provider.getDatabase('usage-zero', 'postgres://user:pass@localhost/usage-zero');
      pool.setHandler(async () => ({
        rows: [{
          _id: 'u0',
          email: 'zero@example.com',
          name: 'Zero',
          created_at: 1,
          usage_count: 0,
          usage_reset_at: 100,
        }],
        rowCount: 1,
      }));
      const user = await provider.findUser(pool, { _id: 'u0' });
      assert.equal(user.usage.count, 0);
      assert.equal(user.usage.reset_at, 100);
    });

    it('omits usage when usage_count column is absent', async () => {
      pool.setHandler(async (sql) => {
        if (sql.startsWith('SELECT * FROM users')) {
          return {
            rows: [{
              _id: 'u3',
              email: 'nousage@example.com',
              name: 'No Usage',
              created_at: 1000,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });
      const user = await provider.findUser(pool, { _id: 'u3' });
      assert.equal(user.usage, undefined);
    });

    it('omits subscription when stripe id is absent', async () => {
      pool.setHandler(async (sql) => {
        if (sql.startsWith('SELECT * FROM users')) {
          return {
            rows: [{
              _id: 'u2',
              email: 'plain@example.com',
              name: 'Plain',
              created_at: 1000,
              usage_count: 0,
              usage_reset_at: null,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });
      const user = await provider.findUser(pool, { _id: 'u2' });
      assert.equal(user.subscription, undefined);
      assert.deepEqual(user.usage, { count: 0, reset_at: null });
    });
  });

  describe('insertUser', () => {
    it('inserts a user', async () => {
      const pool = await provider.getDatabase('insert', 'postgres://user:pass@localhost/insert');
      pool.setHandler(async () => ({ rows: [], rowCount: 1 }));
      const result = await provider.insertUser(pool, {
        _id: 'u1',
        email: 'user@example.com',
        name: 'User',
        created_at: 1000,
      });
      assert.deepEqual(result, { insertedId: 'u1' });
    });
  });

  describe('updateUser', () => {
    let pool;

    beforeEach(async () => {
      pool = await provider.getDatabase('update', 'postgres://user:pass@localhost/update');
      pool.setHandler(async () => ({ rows: [], rowCount: 1 }));
    });

    it('handles $inc for usage.count', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $inc: { 'usage.count': 2 } });
      assert.equal(result.modifiedCount, 1);
      assert.match(clientQueries.at(-1).sql, /usage_count = COALESCE/);
    });

    it('returns modifiedCount 0 for disallowed $inc field', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $inc: { bad: 1 } });
      assert.equal(result.modifiedCount, 0);
    });

    it('increments allowed flat fields via $inc fallback mapping', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $inc: { usage_count: 2 } });
      assert.equal(result.modifiedCount, 1);
      assert.match(clientQueries.at(-1).sql, /usage_count = COALESCE/);
    });

    it('updates subscription with $set', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, {
        $set: { subscription: { stripeID: 'sub', expires: 1, status: 'active' } },
      });
      assert.equal(result.modifiedCount, 1);
      assert.match(clientQueries.at(-1).sql, /subscription_stripeID/);
    });

    it('updates usage with $set', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, {
        $set: { usage: { count: 9, reset_at: 99 } },
      });
      assert.equal(result.modifiedCount, 1);
      assert.match(clientQueries.at(-1).sql, /usage_count/);
    });

    it('updates allowed flat fields', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $set: { name: 'New' } });
      assert.equal(result.modifiedCount, 1);
      assert.match(clientQueries.at(-1).sql, /name = \$1/);
    });

    it('returns modifiedCount 0 for empty $set', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $set: {} });
      assert.equal(result.modifiedCount, 0);
    });

    it('returns modifiedCount 0 when $set is missing', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, {});
      assert.equal(result.modifiedCount, 0);
    });

    it('returns modifiedCount 0 for disallowed flat fields', async () => {
      const result = await provider.updateUser(pool, { _id: 'u1' }, { $set: { hacker: 'x' } });
      assert.equal(result.modifiedCount, 0);
    });
  });

  describe('auth methods', () => {
    let pool;

    beforeEach(async () => {
      pool = await provider.getDatabase('auth', 'postgres://user:pass@localhost/auth');
    });

    it('finds auth by email', async () => {
      pool.setHandler(async (sql) => {
        if (sql.includes('SELECT * FROM auths')) {
          return { rows: [{ email: 'auth@example.com', password: 'hash', userID: 'u1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      const auth = await provider.findAuth(pool, { email: 'auth@example.com' });
      assert.equal(auth.password, 'hash');
    });

    it('returns modifiedCount 0 when auth password update affects no rows', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 0 }));
      const result = await provider.updateAuth(pool, { email: 'missing@example.com' }, { password: 'new' });
      assert.equal(result.modifiedCount, 0);
    });

    it('returns null when auth is not found', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 0 }));
      const auth = await provider.findAuth(pool, { email: 'missing@example.com' });
      assert.equal(auth, null);
    });

    it('inserts auth records', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 1 }));
      const result = await provider.insertAuth(pool, {
        email: 'auth@example.com',
        password: 'hash',
        userID: 'u1',
      });
      assert.deepEqual(result, { insertedId: 'auth@example.com' });
    });

    it('updates auth password when password is a string', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 1 }));
      const result = await provider.updateAuth(pool, { email: 'auth@example.com' }, { password: 'new' });
      assert.equal(result.modifiedCount, 1);
    });

    it('returns modifiedCount 0 when password is not a string', async () => {
      const result = await provider.updateAuth(pool, { email: 'auth@example.com' }, { password: 123 });
      assert.equal(result.modifiedCount, 0);
    });
  });

  describe('webhook event methods', () => {
    let pool;

    beforeEach(async () => {
      pool = await provider.getDatabase('webhook', 'postgres://user:pass@localhost/webhook');
    });

    it('finds webhook events', async () => {
      pool.setHandler(async (sql) => {
        if (sql.includes('webhook_events')) {
          return { rows: [{ event_id: 'evt_1', event_type: 'invoice.paid' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      const event = await provider.findWebhookEvent(pool, 'evt_1');
      assert.equal(event.event_type, 'invoice.paid');
    });

    it('returns null when webhook event is missing', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 0 }));
      const event = await provider.findWebhookEvent(pool, 'evt_missing');
      assert.equal(event, null);
    });

    it('inserts webhook events', async () => {
      pool.setHandler(async () => ({ rows: [], rowCount: 1 }));
      const result = await provider.insertWebhookEvent(pool, 'evt_1', 'invoice.paid', 1000);
      assert.deepEqual(result, { insertedId: 'evt_1' });
    });
  });

  describe('execute', () => {
    let pool;

    beforeEach(async () => {
      pool = await provider.getDatabase('execute', 'postgres://user:pass@localhost/execute');
    });

    it('executes SELECT-like queries', async () => {
      pool.setHandler(async () => ({ command: 'SELECT', rows: [{ id: 1 }], rowCount: 1 }));
      const result = await provider.execute(pool, { query: 'SELECT id FROM users', params: [] });
      assert.equal(result.success, true);
      assert.deepEqual(result.data, [{ id: 1 }]);
      assert.equal(result.metadata.dbType, 'postgresql');
    });

    it('handles execute results without rowCount on modifications', async () => {
      pool.setHandler(async () => ({ rows: [] }));
      const result = await provider.execute(pool, { query: 'UPDATE users SET name = $1', params: ['A'] });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
    });

    it('executes modification queries when rows are undefined', async () => {
      pool.setHandler(async () => ({ rowCount: 2 }));
      const result = await provider.execute(pool, { query: 'DELETE FROM users', params: [] });
      assert.equal(result.success, true);
      assert.equal(result.data.modifiedCount, 2);
      assert.equal(result.data.deletedCount, 2);
    });

    it('handles modification queries without rowCount', async () => {
      pool.setHandler(async () => ({}));
      const result = await provider.execute(pool, { query: 'DELETE FROM users', params: [] });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(result.data.modifiedCount, 0);
    });

    it('ignores non-array transaction property', async () => {
      pool.setHandler(async () => ({ command: 'SELECT', rows: [{ ok: true }], rowCount: 1 }));
      const result = await provider.execute(pool, {
        transaction: 'not-an-array',
        query: 'SELECT ok FROM users',
        params: [],
      });
      assert.equal(result.success, true);
      assert.deepEqual(result.data, [{ ok: true }]);
    });

    it('uses zero rowCount fallback for modifications', async () => {
      pool.setHandler(async () => ({ rows: undefined, rowCount: 0 }));
      const result = await provider.execute(pool, { query: 'UPDATE users SET name = $1', params: ['A'] });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(result.data.modifiedCount, 0);
    });

    it('executes transaction arrays via execute', async () => {
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      });
      const result = await provider.execute(pool, {
        transaction: [
          { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
          { query: 'UPDATE users SET name = $1 WHERE _id = $2', params: ['A', 'u1'] },
        ],
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 2);
    });

    it('returns error when query string is missing', async () => {
      const result = await provider.execute(pool, {});
      assert.equal(result.success, false);
      assert.match(result.error, /Query string is required/);
    });

    it('returns undefined code when query error has no code', async () => {
      pool.setHandler(async () => {
        throw new Error('no code');
      });
      const result = await provider.execute(pool, { query: 'BAD SQL' });
      assert.equal(result.success, false);
      assert.equal(result.code, undefined);
    });

    it('returns error result when query fails', async () => {
      pool.setHandler(async () => {
        const err = new Error('syntax error');
        err.code = '42601';
        throw err;
      });
      const result = await provider.execute(pool, { query: 'BAD SQL' });
      assert.equal(result.success, false);
      assert.equal(result.error, 'syntax error');
      assert.equal(result.code, '42601');
    });
  });

  describe('executeTransaction', () => {
    it('commits empty transaction arrays', async () => {
      const pool = await provider.getDatabase('txn-empty', 'postgres://user:pass@localhost/txn-empty');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
      const result = await provider.executeTransaction(pool, [], Date.now());
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('commits operations on success', async () => {
      const pool = await provider.getDatabase('txn', 'postgres://user:pass@localhost/txn');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      });
      const result = await provider.executeTransaction(pool, [
        { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
      ], Date.now());
      assert.equal(result.success, true);
      assert.equal(result.data[0].rowCount, 1);
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('rolls back and throws when an operation fails', async () => {
      const pool = await provider.getDatabase('txn-fail', 'postgres://user:pass@localhost/txn-fail');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
        if (sql.startsWith('INSERT')) return { rows: [], rowCount: 1 };
        throw new Error('txn failed');
      });
      await assert.rejects(
        () => provider.executeTransaction(pool, [
          { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
          { query: 'BAD', params: [] },
        ], Date.now()),
        /txn failed/
      );
      assert.ok(clientQueries.some((q) => q.sql === 'ROLLBACK'));
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('releases client when begin fails', async () => {
      const pool = await provider.getDatabase('txn-begin-fail', 'postgres://user:pass@localhost/txn-begin-fail');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN') throw new Error('begin failed');
        if (sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      });
      await assert.rejects(
        () => provider.executeTransaction(pool, [
          { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
        ], Date.now()),
        /begin failed/
      );
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('releases client when rollback fails after operation error', async () => {
      const pool = await provider.getDatabase('txn-rollback-fail', 'postgres://user:pass@localhost/txn-rollback-fail');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
        if (sql === 'ROLLBACK') throw new Error('rollback failed');
        throw new Error('op failed');
      });
      await assert.rejects(
        () => provider.executeTransaction(pool, [
          { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
        ], Date.now()),
        /op failed/
      );
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('releases client when commit fails after successful operations', async () => {
      const pool = await provider.getDatabase('txn-commit-fail', 'postgres://user:pass@localhost/txn-commit-fail');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN') return { rows: [], rowCount: 0 };
        if (sql === 'COMMIT') throw new Error('commit failed');
        if (sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      });
      await assert.rejects(
        () => provider.executeTransaction(pool, [
          { query: 'INSERT INTO users VALUES ($1)', params: ['u1'] },
        ], Date.now()),
        /commit failed/
      );
      assert.ok(clientQueries.some((q) => q.sql === 'ROLLBACK'));
      assert.equal(pool._client.release.mock.calls.length, 1);
    });

    it('uses fallbacks when transaction operation results omit rowCount and rows', async () => {
      const pool = await provider.getDatabase('txn-fallback', 'postgres://user:pass@localhost/txn-fallback');
      pool.setHandler(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
        return {};
      });
      const result = await provider.executeTransaction(pool, [
        { query: 'INSERT INTO users VALUES ($1)' },
      ], Date.now());
      assert.equal(result.success, true);
      assert.equal(result.data[0].rowCount, 0);
      assert.deepEqual(result.data[0].rows, []);
      assert.equal(pool._client.release.mock.calls.length, 1);
    });
  });

  describe('closeAll', () => {
    it('ends all pools and clears cache', async () => {
      await provider.getDatabase('close-1', 'postgres://user:pass@localhost/c1');
      await provider.getDatabase('close-2', 'postgres://user:pass@localhost/c2');
      assert.equal(provider.pools.size, 2);
      await provider.closeAll();
      assert.equal(provider.pools.size, 0);
      assert.equal(poolInstances.every((pool) => pool.end.mock.calls.length === 1), true);
    });
  });
});