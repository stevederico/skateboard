import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir as realMkdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { SQLiteProvider, __setFsForTests } from './sqlite.ts';

const TEST_DB_PATH = './databases/test-coverage.db';
const TEST_DB_NAME = 'test-coverage';

let mkdirMode = 'real';
let mkdirCalls = [];

// Inject an in-memory fs seam instead of mocking node:fs — closes over the live
// mkdirMode/mkdirCalls so beforeEach/it mutations take effect.
__setFsForTests({
  async mkdir(path, options) {
    mkdirCalls.push({ path, options });
    if (mkdirMode === 'eexist') {
      throw Object.assign(new Error('exists'), { code: 'EEXIST' });
    }
    if (mkdirMode === 'error') {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    }
    return realMkdir(path, options);
  },
});

describe('SQLiteProvider', () => {
  let provider;
  let db;

  before(async () => {
    await rm(TEST_DB_PATH, { force: true });
    await rm(`${TEST_DB_PATH}-wal`, { force: true });
    await rm(`${TEST_DB_PATH}-shm`, { force: true });
  });

  beforeEach(() => {
    mkdirMode = 'real';
    mkdirCalls = [];
    provider = new SQLiteProvider();
    db = provider.getDatabase(TEST_DB_NAME, TEST_DB_PATH);
    db.exec('DELETE FROM Auths');
    db.exec('DELETE FROM Users');
    db.exec('DELETE FROM WebhookEvents');
  });

  after(() => {
    provider.closeAll();
    rm(TEST_DB_PATH, { force: true });
    rm(`${TEST_DB_PATH}-wal`, { force: true });
    rm(`${TEST_DB_PATH}-shm`, { force: true });
  });

  describe('initialize', () => {
    it('creates databases directory successfully', async () => {
      const p = new SQLiteProvider();
      await p.initialize();
      assert.deepEqual(mkdirCalls, [{ path: './databases', options: { recursive: true } }]);
    });

    it('ignores EEXIST when mkdir reports directory already exists', async () => {
      mkdirMode = 'eexist';
      const p = new SQLiteProvider();
      await p.initialize();
    });

    it('logs non-EEXIST mkdir errors without throwing', async () => {
      mkdirMode = 'error';
      const errors = [];
      const originalError = console.error;
      console.error = (...args) => errors.push(args);

      try {
        const p = new SQLiteProvider();
        await p.initialize();
        assert.ok(errors.some((args) => String(args[0]).includes('Failed to create databases directory')));
      } finally {
        console.error = originalError;
        mkdirMode = 'real';
      }
    });
  });

  describe('getDatabase', () => {
    it('returns cached database instance for the same name', () => {
      const first = provider.getDatabase(TEST_DB_NAME, TEST_DB_PATH);
      const second = provider.getDatabase(TEST_DB_NAME, TEST_DB_PATH);
      assert.equal(first, second);
    });

    it('creates schema tables on first connection', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all().map((row) => row.name);
      assert.deepEqual(tables, ['Auths', 'Users', 'WebhookEvents']);
    });

    it('uses default database path when connection string is null', async () => {
      const p = new SQLiteProvider();
      const defaultDb = p.getDatabase('default-path-db', null);
      assert.ok(defaultDb);
      p.closeAll();
      await rm('./databases/default-path-db.db', { force: true });
      await rm('./databases/default-path-db.db-wal', { force: true });
      await rm('./databases/default-path-db.db-shm', { force: true });
    });
  });

  describe('findUser', () => {
    const userId = 'user-1';
    const email = 'user@example.com';

    beforeEach(() => {
      db.prepare(
        `INSERT INTO Users (_id, email, name, created_at, subscription_stripeID, subscription_expires, subscription_status, usage_count, usage_reset_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(userId, email, 'Test User', 1000, 'sub_123', 2000, 'active', 5, 3000);
    });

    it('finds user by _id and transforms subscription and usage', async () => {
      const user = await provider.findUser(db, { _id: userId });
      assert.equal(user._id, userId);
      assert.deepEqual(user.subscription, { stripeID: 'sub_123', expires: 2000, status: 'active' });
      assert.deepEqual(user.usage, { count: 5, reset_at: 3000 });
      assert.equal(user.subscription_stripeID, undefined);
      assert.equal(user.usage_count, undefined);
    });

    it('finds user by email', async () => {
      const user = await provider.findUser(db, { email });
      assert.equal(user.email, email);
    });

    it('returns null when neither _id nor email is provided', async () => {
      const user = await provider.findUser(db, {});
      assert.equal(user, null);
    });

    it('returns null when user is not found', async () => {
      const user = await provider.findUser(db, { _id: 'missing' });
      assert.equal(user, null);
    });

    it('omits subscription when stripe id is absent', async () => {
      db.exec('DELETE FROM Users');
      db.prepare('INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)')
        .run('user-2', 'plain@example.com', 'Plain', 1000);
      const user = await provider.findUser(db, { _id: 'user-2' });
      assert.equal(user.subscription, undefined);
      assert.deepEqual(user.usage, { count: 0, reset_at: null });
    });
  });

  describe('insertUser', () => {
    it('inserts a user and returns insertedId', async () => {
      const result = await provider.insertUser(db, {
        _id: 'new-user',
        email: 'new@example.com',
        name: 'New User',
        created_at: 1234,
      });
      assert.deepEqual(result, { insertedId: 'new-user' });
      const row = db.prepare('SELECT email FROM Users WHERE _id = ?').get('new-user');
      assert.equal(row.email, 'new@example.com');
    });
  });

  describe('updateUser', () => {
    beforeEach(() => {
      db.prepare('INSERT INTO Users (_id, email, name, created_at, usage_count) VALUES (?, ?, ?, ?, ?)')
        .run('user-1', 'user@example.com', 'Test', 1000, 2);
    });

    it('increments usage.count with $inc', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $inc: { 'usage.count': 3 } });
      assert.equal(result.modifiedCount, 1);
      const count = db.prepare('SELECT usage_count FROM Users WHERE _id = ?').get('user-1').usage_count;
      assert.equal(count, 5);
    });

    it('returns modifiedCount 0 for disallowed $inc field', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $inc: { 'bad.field': 1 } });
      assert.equal(result.modifiedCount, 0);
    });

    it('increments allowed flat fields via $inc fallback mapping', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $inc: { usage_count: 4 } });
      assert.equal(result.modifiedCount, 1);
      const count = db.prepare('SELECT usage_count FROM Users WHERE _id = ?').get('user-1').usage_count;
      assert.equal(count, 6);
    });

    it('updates subscription object with $set', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, {
        $set: { subscription: { stripeID: 'sub_1', expires: 4000, status: 'active' } },
      });
      assert.equal(result.modifiedCount, 1);
      const row = db.prepare('SELECT subscription_stripeID, subscription_status FROM Users WHERE _id = ?').get('user-1');
      assert.equal(row.subscription_stripeID, 'sub_1');
      assert.equal(row.subscription_status, 'active');
    });

    it('updates usage object with $set', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, {
        $set: { usage: { count: 9, reset_at: 5000 } },
      });
      assert.equal(result.modifiedCount, 1);
      const row = db.prepare('SELECT usage_count, usage_reset_at FROM Users WHERE _id = ?').get('user-1');
      assert.equal(row.usage_count, 9);
      assert.equal(row.usage_reset_at, 5000);
    });

    it('updates allowed flat fields with $set', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $set: { name: 'Updated Name' } });
      assert.equal(result.modifiedCount, 1);
      const row = db.prepare('SELECT name FROM Users WHERE _id = ?').get('user-1');
      assert.equal(row.name, 'Updated Name');
    });

    it('returns modifiedCount 0 for empty $set', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $set: {} });
      assert.equal(result.modifiedCount, 0);
    });

    it('returns modifiedCount 0 when $set is missing', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, {});
      assert.equal(result.modifiedCount, 0);
    });

    it('returns modifiedCount 0 for disallowed flat fields', async () => {
      const result = await provider.updateUser(db, { _id: 'user-1' }, { $set: { hacker: 'x' } });
      assert.equal(result.modifiedCount, 0);
    });
  });

  describe('auth methods', () => {
    beforeEach(() => {
      db.prepare('INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)')
        .run('user-1', 'auth@example.com', 'Auth User', 1000);
    });

    it('inserts and finds auth records', async () => {
      const inserted = await provider.insertAuth(db, {
        email: 'auth@example.com',
        password: 'hash',
        userID: 'user-1',
      });
      assert.deepEqual(inserted, { insertedId: 'auth@example.com' });

      const auth = await provider.findAuth(db, { email: 'auth@example.com' });
      assert.equal(auth.password, 'hash');
      assert.equal(auth.userID, 'user-1');
    });

    it('updates auth password when password is a string', async () => {
      await provider.insertAuth(db, { email: 'auth@example.com', password: 'old', userID: 'user-1' });
      const result = await provider.updateAuth(db, { email: 'auth@example.com' }, { password: 'new-hash' });
      assert.equal(result.modifiedCount, 1);
      const auth = await provider.findAuth(db, { email: 'auth@example.com' });
      assert.equal(auth.password, 'new-hash');
    });

    it('returns modifiedCount 0 when password is not a string', async () => {
      await provider.insertAuth(db, { email: 'auth@example.com', password: 'old', userID: 'user-1' });
      const result = await provider.updateAuth(db, { email: 'auth@example.com' }, { password: 123 });
      assert.equal(result.modifiedCount, 0);
    });
  });

  describe('webhook event methods', () => {
    it('inserts and finds webhook events', async () => {
      const inserted = await provider.insertWebhookEvent(db, 'evt_1', 'invoice.paid', 1700000000);
      assert.deepEqual(inserted, { insertedId: 'evt_1' });

      const event = await provider.findWebhookEvent(db, 'evt_1');
      assert.equal(event.event_type, 'invoice.paid');
      assert.equal(event.processed_at, 1700000000);
    });

    it('returns modifiedCount 0 when auth update affects no rows', async () => {
      const result = await provider.updateAuth(db, { email: 'missing@example.com' }, { password: 'new' });
      assert.equal(result.modifiedCount, 0);
    });

    it('returns undefined when webhook event is missing', async () => {
      const event = await provider.findWebhookEvent(db, 'evt_missing');
      assert.equal(event, null);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      db.prepare('INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)')
        .run('exec-user', 'exec@example.com', 'Exec', 1000);
    });

    it('executes SELECT queries', async () => {
      const result = await provider.execute(db, {
        query: 'SELECT email FROM Users WHERE _id = ?',
        params: ['exec-user'],
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 1);
      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].email, 'exec@example.com');
      assert.equal(result.metadata.dbType, 'sqlite');
    });

    it('executes INSERT/UPDATE/DELETE modification queries', async () => {
      const insert = await provider.execute(db, {
        query: 'INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)',
        params: ['exec-user-2', 'exec2@example.com', 'Exec2', 2000],
      });
      assert.equal(insert.success, true);
      assert.equal(insert.data.modifiedCount, 1);

      const update = await provider.execute(db, {
        query: 'UPDATE Users SET name = ? WHERE _id = ?',
        params: ['Updated', 'exec-user'],
      });
      assert.equal(update.success, true);
      assert.equal(update.data.modifiedCount, 1);

      const del = await provider.execute(db, {
        query: 'DELETE FROM Users WHERE _id = ?',
        params: ['exec-user-2'],
      });
      assert.equal(del.success, true);
      assert.equal(del.data.deletedCount, 1);
    });

    it('handles modification results without lastInsertRowid or changes', async () => {
      const originalPrepare = db.prepare.bind(db);
      db.prepare = (sql) => {
        const stmt = originalPrepare(sql);
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
          return stmt;
        }
        return {
          run: () => ({}),
          all: stmt.all.bind(stmt),
          get: stmt.get.bind(stmt),
        };
      };
      const result = await provider.execute(db, { query: 'DELETE FROM Users WHERE _id = ?', params: ['nope'] });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(result.data.modifiedCount, undefined);
      db.prepare = originalPrepare;
    });

    it('executes transaction arrays via execute', async () => {
      const result = await provider.execute(db, {
        transaction: [
          {
            query: 'INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)',
            params: ['txn-1', 'txn@example.com', 'Txn', 3000],
          },
          {
            query: 'UPDATE Users SET name = ? WHERE _id = ?',
            params: ['Txn Updated', 'txn-1'],
          },
        ],
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 2);
      assert.equal(result.data.length, 2);
    });

    it('returns error when query string is missing', async () => {
      const result = await provider.execute(db, { params: [] });
      assert.equal(result.success, false);
      assert.match(result.error, /Query string is required/);
    });

    it('returns error result when SQL is invalid', async () => {
      const result = await provider.execute(db, { query: 'NOT VALID SQL !!!' });
      assert.equal(result.success, false);
      assert.ok(result.error);
      assert.equal(result.metadata.dbType, 'sqlite');
    });
  });

  describe('executeTransaction', () => {
    it('commits all operations on success', async () => {
      const result = await provider.executeTransaction(db, [
        {
          query: 'INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)',
          params: ['txn-ok', 'txn-ok@example.com', 'Txn OK', 4000],
        },
      ], Date.now());

      assert.equal(result.success, true);
      assert.equal(result.data[0].changes, 1);
      const row = db.prepare('SELECT email FROM Users WHERE _id = ?').get('txn-ok');
      assert.equal(row.email, 'txn-ok@example.com');
    });

    it('uses zero fallbacks for missing transaction result metadata', async () => {
      const originalPrepare = db.prepare.bind(db);
      db.prepare = (sql) => ({
        run: () => ({}),
      });
      const result = await provider.executeTransaction(db, [
        { query: 'DELETE FROM Users WHERE _id = ?', params: ['missing'] },
      ], Date.now());
      assert.equal(result.data[0].changes, 0);
      assert.equal(result.data[0].lastInsertRowid, null);
      db.prepare = originalPrepare;
    });

    it('rolls back all operations when one fails', async () => {
      await assert.rejects(
        () => provider.executeTransaction(db, [
          {
            query: 'INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)',
            params: ['txn-fail', 'txn-fail@example.com', 'Txn Fail', 5000],
          },
          { query: 'INSERT INTO Users (bad_column) VALUES (?)', params: ['x'] },
        ], Date.now()),
        /bad_column/
      );

      const row = db.prepare('SELECT _id FROM Users WHERE _id = ?').get('txn-fail');
      assert.equal(row, undefined);
    });
  });

  describe('closeAll', () => {
    it('closes and clears all cached database connections', () => {
      provider.getDatabase('another-db', './databases/another-coverage.db');
      assert.equal(provider.databases.size, 2);
      provider.closeAll();
      assert.equal(provider.databases.size, 0);
      rm('./databases/another-coverage.db', { force: true });
      rm('./databases/another-coverage.db-wal', { force: true });
      rm('./databases/another-coverage.db-shm', { force: true });
    });
  });
});