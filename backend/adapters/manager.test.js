import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { databaseManager, __setProviderLoadersForTests } from './manager.ts';

const SQLITE_DB_PATH = './databases/manager-test-coverage.db';
const SQLITE_DB_NAME = 'manager-test-coverage';

function createTrackingProvider(label) {
  const calls = [];
  const track = (method) => async (...args) => {
    calls.push({ method, args });
    if (method === 'getDatabase') {
      return { dbName: args[0], connectionString: args[1] };
    }
    return { label, method, args };
  };

  return {
    label,
    calls,
    initialize: track('initialize'),
    getDatabase: track('getDatabase'),
    findUser: track('findUser'),
    insertUser: track('insertUser'),
    updateUser: track('updateUser'),
    findAuth: track('findAuth'),
    insertAuth: track('insertAuth'),
    updateAuth: track('updateAuth'),
    findWebhookEvent: track('findWebhookEvent'),
    insertWebhookEvent: track('insertWebhookEvent'),
    execute: track('execute'),
    closeAll: async () => {
      calls.push({ method: 'closeAll', args: [] });
    },
  };
}

const postgresProvider = createTrackingProvider('postgres');
const mongoProvider = createTrackingProvider('mongo');

// Inject fake provider constructors via the manager's test seam instead of mock.module.
// Each fake class returns the shared tracking provider from its constructor — same
// behavior the previous mock.module exports gave.
__setProviderLoadersForTests({
  postgres: async () =>
    class {
      constructor() {
        return postgresProvider;
      }
    },
  mongodb: async () =>
    class {
      constructor() {
        return mongoProvider;
      }
    },
});

describe('DatabaseManager sqlite integration', () => {
  before(async () => {
    await rm(SQLITE_DB_PATH, { force: true });
    await rm(`${SQLITE_DB_PATH}-wal`, { force: true });
    await rm(`${SQLITE_DB_PATH}-shm`, { force: true });
  });

  beforeEach(async () => {
    await databaseManager.closeAll();
    const { database } = await databaseManager.getDatabase('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH);
    database.exec('DELETE FROM Auths');
    database.exec('DELETE FROM Users');
    database.exec('DELETE FROM WebhookEvents');
  });

  after(async () => {
    await databaseManager.closeAll();
    await rm(SQLITE_DB_PATH, { force: true });
    await rm(`${SQLITE_DB_PATH}-wal`, { force: true });
    await rm(`${SQLITE_DB_PATH}-shm`, { force: true });
  });

  it('getProvider creates and caches sqlite provider', async () => {
    const first = await databaseManager.getProvider('sqlite');
    const second = await databaseManager.getProvider('sqlite');
    assert.equal(first, second);
  });

  it('getProvider throws for unsupported database type', async () => {
    await assert.rejects(
      () => databaseManager.getProvider('redis'),
      /Unsupported database type: redis/
    );
  });

  it('getDatabase caches connections by db type, name, and connection string', async () => {
    const first = await databaseManager.getDatabase('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH);
    const second = await databaseManager.getDatabase('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH);
    assert.equal(first.database, second.database);
    assert.equal(first.provider, second.provider);
  });

  it('uses default connection key when connection string is omitted', async () => {
    const first = await databaseManager.getDatabase('sqlite', 'default-conn-db');
    const second = await databaseManager.getDatabase('sqlite', 'default-conn-db');
    assert.equal(first.database, second.database);
    await databaseManager.closeAll();
    await rm('./databases/default-conn-db.db', { force: true });
    await rm('./databases/default-conn-db.db-wal', { force: true });
    await rm('./databases/default-conn-db.db-shm', { force: true });
  });

  it('delegates findUser to sqlite provider', async () => {
    await databaseManager.insertUser('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      _id: 'mgr-user-1',
      email: 'mgr@example.com',
      name: 'Manager User',
      created_at: 1000,
    });
    const user = await databaseManager.findUser('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, { email: 'mgr@example.com' });
    assert.equal(user.name, 'Manager User');
  });

  it('delegates insertUser to sqlite provider', async () => {
    const result = await databaseManager.insertUser('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      _id: 'mgr-user-2',
      email: 'insert@example.com',
      name: 'Insert User',
      created_at: 2000,
    });
    assert.deepEqual(result, { insertedId: 'mgr-user-2' });
  });

  it('delegates updateUser to sqlite provider', async () => {
    await databaseManager.insertUser('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      _id: 'mgr-user-3',
      email: 'update@example.com',
      name: 'Before',
      created_at: 3000,
    });
    const result = await databaseManager.updateUser(
      'sqlite',
      SQLITE_DB_NAME,
      SQLITE_DB_PATH,
      { _id: 'mgr-user-3' },
      { $set: { name: 'After' } }
    );
    assert.equal(result.modifiedCount, 1);
  });

  it('delegates auth methods to sqlite provider', async () => {
    await databaseManager.insertUser('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      _id: 'mgr-user-4',
      email: 'auth@example.com',
      name: 'Auth User',
      created_at: 4000,
    });
    await databaseManager.insertAuth('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      email: 'auth@example.com',
      password: 'hash',
      userID: 'mgr-user-4',
    });
    const auth = await databaseManager.findAuth('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, { email: 'auth@example.com' });
    assert.equal(auth.password, 'hash');

    const updated = await databaseManager.updateAuth(
      'sqlite',
      SQLITE_DB_NAME,
      SQLITE_DB_PATH,
      { email: 'auth@example.com' },
      { password: 'new-hash' }
    );
    assert.equal(updated.modifiedCount, 1);
  });

  it('delegates webhook methods to sqlite provider', async () => {
    const inserted = await databaseManager.insertWebhookEvent(
      'sqlite',
      SQLITE_DB_NAME,
      SQLITE_DB_PATH,
      'evt_mgr_1',
      'invoice.paid',
      1700000000
    );
    assert.deepEqual(inserted, { insertedId: 'evt_mgr_1' });

    const found = await databaseManager.findWebhookEvent('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, 'evt_mgr_1');
    assert.equal(found.event_type, 'invoice.paid');
  });

  it('delegates executeQuery to sqlite provider execute', async () => {
    const result = await databaseManager.executeQuery('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH, {
      query: 'SELECT COUNT(*) AS count FROM Users',
    });
    assert.equal(result.success, true);
    assert.equal(result.rowCount, 1);
  });

  it('closeAll closes providers and clears caches', async () => {
    await databaseManager.getProvider('sqlite');
    await databaseManager.getDatabase('sqlite', SQLITE_DB_NAME, SQLITE_DB_PATH);
    await databaseManager.closeAll();
    assert.equal(databaseManager.providers.size, 0);
    assert.equal(databaseManager.activeConnections.size, 0);
  });
});

describe('DatabaseManager mocked postgres and mongo providers', () => {
  beforeEach(async () => {
    await databaseManager.closeAll();
    postgresProvider.calls.length = 0;
    mongoProvider.calls.length = 0;
  });

  it('getProvider supports postgres and postgresql aliases', async () => {
    const postgres = await databaseManager.getProvider('postgres');
    const postgresql = await databaseManager.getProvider('postgresql');
    assert.equal(postgres.label, 'postgres');
    assert.equal(postgresql.label, 'postgres');
    assert.equal(databaseManager.providers.has('postgres'), true);
    assert.equal(databaseManager.providers.has('postgresql'), true);
    assert.equal(postgresProvider.calls.filter((c) => c.method === 'initialize').length, 2);
  });

  it('getProvider supports mongo and mongodb aliases', async () => {
    const mongo = await databaseManager.getProvider('mongo');
    const mongodb = await databaseManager.getProvider('mongodb');
    assert.equal(mongo.label, 'mongo');
    assert.equal(mongodb.label, 'mongo');
    assert.equal(databaseManager.providers.has('mongo'), true);
    assert.equal(databaseManager.providers.has('mongodb'), true);
    assert.equal(mongoProvider.calls.filter((c) => c.method === 'initialize').length, 2);
  });

  it('getDatabase caches mocked provider connections', async () => {
    const first = await databaseManager.getDatabase('postgres', 'app', 'postgres://localhost/app');
    const second = await databaseManager.getDatabase('postgres', 'app', 'postgres://localhost/app');
    assert.deepEqual(first.database, second.database);
    assert.equal(postgresProvider.calls.filter((c) => c.method === 'getDatabase').length, 1);
  });

  it('delegates CRUD and execute methods to postgres provider', async () => {
    await databaseManager.findUser('postgres', 'app', 'postgres://localhost/app', { email: 'a@b.com' });
    await databaseManager.insertUser('postgres', 'app', 'postgres://localhost/app', { _id: 'u1' });
    await databaseManager.updateUser('postgres', 'app', 'postgres://localhost/app', { _id: 'u1' }, { $set: { name: 'A' } });
    await databaseManager.findAuth('postgres', 'app', 'postgres://localhost/app', { email: 'a@b.com' });
    await databaseManager.insertAuth('postgres', 'app', 'postgres://localhost/app', { email: 'a@b.com' });
    await databaseManager.updateAuth('postgres', 'app', 'postgres://localhost/app', { email: 'a@b.com' }, { password: 'x' });
    await databaseManager.findWebhookEvent('postgres', 'app', 'postgres://localhost/app', 'evt_1');
    await databaseManager.insertWebhookEvent('postgres', 'app', 'postgres://localhost/app', 'evt_1', 'invoice.paid', 1);
    await databaseManager.executeQuery('postgres', 'app', 'postgres://localhost/app', { query: 'SELECT 1' });

    const methods = postgresProvider.calls.map((c) => c.method);
    assert.deepEqual(methods, [
      'initialize',
      'getDatabase',
      'findUser',
      'insertUser',
      'updateUser',
      'findAuth',
      'insertAuth',
      'updateAuth',
      'findWebhookEvent',
      'insertWebhookEvent',
      'execute',
    ]);
  });

  it('delegates CRUD and execute methods to mongo provider', async () => {
    await databaseManager.findUser('mongodb', 'app', 'mongodb://localhost/app', { email: 'a@b.com' });
    await databaseManager.insertUser('mongodb', 'app', 'mongodb://localhost/app', { _id: 'u1' });
    await databaseManager.updateUser('mongodb', 'app', 'mongodb://localhost/app', { _id: 'u1' }, { $set: { name: 'A' } });
    await databaseManager.findAuth('mongodb', 'app', 'mongodb://localhost/app', { email: 'a@b.com' });
    await databaseManager.insertAuth('mongodb', 'app', 'mongodb://localhost/app', { email: 'a@b.com' });
    await databaseManager.updateAuth('mongodb', 'app', 'mongodb://localhost/app', { email: 'a@b.com' }, { password: 'x' });
    await databaseManager.findWebhookEvent('mongodb', 'app', 'mongodb://localhost/app', 'evt_1');
    await databaseManager.insertWebhookEvent('mongodb', 'app', 'mongodb://localhost/app', 'evt_1', 'invoice.paid', 1);
    await databaseManager.executeQuery('mongodb', 'app', 'mongodb://localhost/app', { collection: 'Users', operation: 'findone' });

    const methods = mongoProvider.calls.map((c) => c.method);
    assert.deepEqual(methods, [
      'initialize',
      'getDatabase',
      'findUser',
      'insertUser',
      'updateUser',
      'findAuth',
      'insertAuth',
      'updateAuth',
      'findWebhookEvent',
      'insertWebhookEvent',
      'execute',
    ]);
  });

  it('closeAll delegates to mocked providers and clears caches', async () => {
    await databaseManager.getProvider('postgres');
    await databaseManager.getProvider('mongodb');
    await databaseManager.closeAll();
    assert.equal(databaseManager.providers.size, 0);
    assert.equal(databaseManager.activeConnections.size, 0);
    assert.equal(postgresProvider.calls.some((c) => c.method === 'closeAll'), true);
    assert.equal(mongoProvider.calls.some((c) => c.method === 'closeAll'), true);
  });
});