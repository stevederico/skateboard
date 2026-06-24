import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MongoDBProvider, __setMongoModuleLoaderForTests } from './mongodb.ts';

const mongoClientConfigs = [];
const mongoClients = [];

function createCollection(name, impl = {}) {
  return {
    findOne: mock.fn(impl.findOne || (async () => null)),
    find: mock.fn(impl.find || (() => ({ toArray: async () => [] }))),
    insertOne: mock.fn(impl.insertOne || (async (doc) => ({ insertedId: `id-${name}`, insertedCount: 1, acknowledged: true, doc }))),
    insertMany: mock.fn(impl.insertMany || (async (docs) => ({ insertedIds: { 0: 'id-0' }, insertedCount: docs.length }))),
    updateOne: mock.fn(impl.updateOne || (async () => ({ modifiedCount: 1, matchedCount: 1, upsertedId: null }))),
    updateMany: mock.fn(impl.updateMany || (async () => ({ modifiedCount: 2, matchedCount: 2, upsertedCount: 0 }))),
    deleteOne: mock.fn(impl.deleteOne || (async () => ({ deletedCount: 1 }))),
    deleteMany: mock.fn(impl.deleteMany || (async () => ({ deletedCount: 2 }))),
    aggregate: mock.fn(impl.aggregate || (() => ({ toArray: async () => [{ total: 1 }] }))),
    countDocuments: mock.fn(impl.countDocuments || (async () => 3)),
    distinct: mock.fn(impl.distinct || (async () => ['a', 'b'])),
    createIndex: mock.fn(async () => 'index'),
  };
}

function createMockDb(collectionNames = []) {
  const collections = new Map();
  const db = {
    listCollections: mock.fn(() => ({ toArray: async () => collectionNames.map((name) => ({ name })) })),
    createCollection: mock.fn(async (name) => {
      collectionNames.push(name);
      collections.set(name, createCollection(name));
      return collections.get(name);
    }),
    collection: mock.fn((name) => {
      if (!collections.has(name)) {
        collections.set(name, createCollection(name));
      }
      return collections.get(name);
    }),
    client: {
      startSession: mock.fn(() => ({
        withTransaction: mock.fn(async (fn) => fn()),
        endSession: mock.fn(async () => {}),
      })),
    },
    _collections: collections,
  };
  return db;
}

class MockMongoClient {
  constructor(connectionString, options) {
    this.connectionString = connectionString;
    this.options = options;
    mongoClientConfigs.push({ connectionString, options });
    mongoClients.push(this);
    this.connect = mock.fn(async () => {});
    this.close = mock.fn(async () => {});
    this._db = createMockDb();
    this.db = mock.fn((name) => {
      this._db.name = name;
      return this._db;
    });
  }
}

// Inject a fake `mongodb` surface via the module-loader seam instead of
// mock.module('mongodb'), which breaks named-import resolution under Node 24.14.
__setMongoModuleLoaderForTests(async () => ({ MongoClient: MockMongoClient }));

describe('MongoDBProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new MongoDBProvider();
    mongoClientConfigs.length = 0;
    mongoClients.length = 0;
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
        () => provider.getDatabase('app'),
        /Connection string required/
      );
    });

    it('connects with pooling options and returns cached database', async () => {
      const first = await provider.getDatabase('app', 'mongodb://localhost:27017');
      const second = await provider.getDatabase('app', 'mongodb://localhost:27017');
      assert.equal(first, second);
      assert.equal(mongoClients.length, 1);
      assert.equal(mongoClientConfigs[0].options.maxPoolSize, 10);
      assert.equal(mongoClients[0].connect.mock.calls.length, 1);
    });

    it('creates collections when they do not exist', async () => {
      const freshProvider = new MongoDBProvider();
      await freshProvider.getDatabase('schema-missing', 'mongodb://localhost:27017');
      const freshDb = mongoClients.at(-1)._db;
      assert.equal(freshDb.createCollection.mock.calls.length, 3);
      assert.equal(freshDb.collection('Users').createIndex.mock.calls.length, 1);
      assert.equal(freshDb.collection('Auths').createIndex.mock.calls.length, 1);
      assert.equal(freshDb.collection('WebhookEvents').createIndex.mock.calls.length, 1);
      await freshProvider.closeAll();
    });

    it('creates only missing collections when some already exist', async () => {
      const partialProvider = new MongoDBProvider();
      const client = new MockMongoClient('mongodb://localhost:27017', {});
      client._db = createMockDb(['Users']);
      client.db = mock.fn(() => client._db);
      mongoClients.push(client);
      partialProvider.clients.set('partial_mongodb://localhost:27017', client);
      partialProvider.databases.set('partial_mongodb://localhost:27017', client._db);

      await partialProvider.ensureMongoDBSchema(client._db);
      assert.equal(client._db.createCollection.mock.calls.length, 2);
      await partialProvider.closeAll();
    });

    it('skips collection creation when collections already exist', async () => {
      const existingProvider = new MongoDBProvider();
      const client = new MockMongoClient('mongodb://localhost:27017', {});
      client._db = createMockDb(['Users', 'Auths', 'WebhookEvents']);
      client.db = mock.fn(() => client._db);
      mongoClients.push(client);

      existingProvider.clients.set('existing_mongodb://localhost:27017', client);
      existingProvider.databases.set('existing_mongodb://localhost:27017', client._db);

      await existingProvider.ensureMongoDBSchema(client._db);
      assert.equal(client._db.createCollection.mock.calls.length, 0);
      await existingProvider.closeAll();
    });
  });

  describe('findUser', () => {
    let db;

    beforeEach(async () => {
      db = await provider.getDatabase('users', 'mongodb://localhost/users');
    });

    it('finds user by _id', async () => {
      const users = db.collection('Users');
      users.findOne.mock.mockImplementation(async () => ({ _id: 'u1', email: 'user@example.com' }));
      const user = await provider.findUser(db, { _id: 'u1' });
      assert.equal(user._id, 'u1');
    });

    it('passes projection to findOne', async () => {
      const db = await provider.getDatabase('projection', 'mongodb://localhost/projection');
      db.collection('Users').findOne.mock.mockImplementation(async (_query, opts) => {
        assert.deepEqual(opts, { projection: { email: 1 } });
        return { _id: 'u1', email: 'a@b.com' };
      });
      const user = await provider.findUser(db, { email: 'a@b.com' }, { email: 1 });
      assert.equal(user.email, 'a@b.com');
    });

    it('finds user by email', async () => {
      const users = db.collection('Users');
      users.findOne.mock.mockImplementation(async () => ({ _id: 'u1', email: 'user@example.com' }));
      const user = await provider.findUser(db, { email: 'user@example.com' });
      assert.equal(user.email, 'user@example.com');
    });

    it('returns null when neither _id nor email is provided', async () => {
      const user = await provider.findUser(db, {});
      assert.equal(user, null);
    });

    it('returns null when user is not found', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => null);
      const user = await provider.findUser(db, { _id: 'missing' });
      assert.equal(user, null);
    });
  });

  describe('insertUser', () => {
    it('inserts a user document', async () => {
      const db = await provider.getDatabase('insert', 'mongodb://localhost/insert');
      const result = await provider.insertUser(db, {
        _id: 'u1',
        email: 'user@example.com',
        name: 'User',
        created_at: 1000,
      });
      assert.equal(result.insertedId, 'id-Users');
      assert.equal(db.collection('Users').insertOne.mock.calls.length, 1);
    });
  });

  describe('updateUser', () => {
    it('delegates to updateOne', async () => {
      const db = await provider.getDatabase('update', 'mongodb://localhost/update');
      const result = await provider.updateUser(db, { _id: 'u1' }, { $set: { name: 'Updated' } });
      assert.equal(result.modifiedCount, 1);
      const [filter, update] = db.collection('Users').updateOne.mock.calls[0].arguments;
      assert.deepEqual(filter, { _id: 'u1' });
      assert.deepEqual(update, { $set: { name: 'Updated' } });
    });
  });

  describe('auth methods', () => {
    let db;

    beforeEach(async () => {
      db = await provider.getDatabase('auth', 'mongodb://localhost/auth');
    });

    it('finds auth by email', async () => {
      db.collection('Auths').findOne.mock.mockImplementation(async () => ({ email: 'auth@example.com', password: 'hash' }));
      const auth = await provider.findAuth(db, { email: 'auth@example.com' });
      assert.equal(auth.password, 'hash');
    });

    it('inserts auth records', async () => {
      const result = await provider.insertAuth(db, {
        email: 'auth@example.com',
        password: 'hash',
        userID: 'u1',
      });
      assert.equal(result.insertedId, 'id-Auths');
    });

    it('updates auth password when password is a string', async () => {
      const result = await provider.updateAuth(db, { email: 'auth@example.com' }, { password: 'new' });
      assert.equal(result.modifiedCount, 1);
      const [, update] = db.collection('Auths').updateOne.mock.calls.at(-1).arguments;
      assert.deepEqual(update, { $set: { password: 'new' } });
    });

    it('returns modifiedCount 0 when password is not a string', async () => {
      const result = await provider.updateAuth(db, { email: 'auth@example.com' }, { password: 123 });
      assert.equal(result.modifiedCount, 0);
    });
  });

  describe('webhook event methods', () => {
    it('finds and inserts webhook events', async () => {
      const db = await provider.getDatabase('webhook', 'mongodb://localhost/webhook');
      db.collection('WebhookEvents').findOne.mock.mockImplementation(async () => ({
        event_id: 'evt_1',
        event_type: 'invoice.paid',
      }));
      const found = await provider.findWebhookEvent(db, 'evt_1');
      assert.equal(found.event_type, 'invoice.paid');

      const inserted = await provider.insertWebhookEvent(db, 'evt_2', 'invoice.paid', 1000);
      assert.equal(inserted.insertedId, 'id-WebhookEvents');
      const [doc] = db.collection('WebhookEvents').insertOne.mock.calls.at(-1).arguments;
      assert.deepEqual(doc, { event_id: 'evt_2', event_type: 'invoice.paid', processed_at: 1000 });
    });
  });

  describe('execute', () => {
    let db;

    beforeEach(async () => {
      db = await provider.getDatabase('execute', 'mongodb://localhost/execute');
    });

    const operations = [
      ['findone', { query: { _id: 'u1' } }, 1],
      ['find', { query: { active: true } }, 2],
      ['insertone', { _id: 'u2' }, 1],
      ['insertmany', [{ _id: 'u3' }, { _id: 'u4' }], 2],
      ['updateone', { _id: 'u1' }, 1, { update: { $set: { name: 'A' } } }],
      ['updatemany', { active: true }, 2, { update: { $set: { active: false } } }],
      ['deleteone', { _id: 'u1' }, 1],
      ['deletemany', { stale: true }, 2],
      ['aggregate', null, 1, { pipeline: [{ $match: { active: true } }] }],
      ['countdocuments', { active: true }, 1],
      ['distinct', null, 2, { query: { field: 'email', filter: { active: true } } }],
    ];

    for (const [operation, query, expectedRowCount, extra = {}] of operations) {
      it(`supports ${operation} operation`, async () => {
        if (operation === 'findone') {
          db.collection('Users').findOne.mock.mockImplementation(async () => ({ _id: 'u1' }));
        }
        if (operation === 'find') {
          db.collection('Users').find.mock.mockImplementation(() => ({ toArray: async () => [{ _id: '1' }, { _id: '2' }] }));
        }
        const result = await provider.execute(db, {
          collection: 'Users',
          operation,
          query,
          ...extra,
        });
        assert.equal(result.success, true);
        assert.equal(result.rowCount, expectedRowCount);
        assert.equal(result.metadata.dbType, 'mongodb');
      });
    }

    it('executes transaction arrays via execute', async () => {
      const result = await provider.execute(db, {
        transaction: [
          { collection: 'Users', operation: 'insertone', query: { _id: 'txn-1' } },
          { collection: 'Users', operation: 'updateone', query: { _id: 'txn-1' }, update: { $set: { name: 'Txn' } } },
        ],
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 2);
    });

    it('returns zero rowCount when findone returns null', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => null);
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'findone',
        query: { _id: 'missing' },
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(result.data, null);
    });

    it('executes aggregate with explicit pipeline', async () => {
      const db = await provider.getDatabase('aggregate', 'mongodb://localhost/aggregate');
      const cursor = { toArray: async () => [{ total: 3 }] };
      db.collection('Users').aggregate.mock.mockImplementation(() => cursor);
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'aggregate',
        pipeline: [{ $match: { active: true } }],
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 1);
      assert.deepEqual(db.collection('Users').aggregate.mock.calls[0].arguments[0], [{ $match: { active: true } }]);
    });

    it('ignores non-array transaction property', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => ({ _id: 'u1' }));
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'findone',
        query: { _id: 'u1' },
        transaction: 'not-an-array',
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 1);
    });

    it('passes explicit query and options to find', async () => {
      const db = await provider.getDatabase('find-opts', 'mongodb://localhost/find-opts');
      const cursor = { toArray: async () => [{ _id: 'u1' }] };
      db.collection('Users').find.mock.mockImplementation(() => cursor);
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'find',
        query: { email: 'a@b.com' },
        options: { limit: 1 },
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 1);
      assert.equal(db.collection('Users').find.mock.calls[0].arguments[0].email, 'a@b.com');
      assert.equal(db.collection('Users').find.mock.calls[0].arguments[1].limit, 1);
    });

    it('uses default empty query objects for optional execute parameters', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => null);
      const findone = await provider.execute(db, { collection: 'Users', operation: 'findone' });
      assert.equal(findone.rowCount, 0);

      db.collection('Users').find.mock.mockImplementation(() => ({ toArray: async () => [] }));
      const find = await provider.execute(db, { collection: 'Users', operation: 'find' });
      assert.equal(find.rowCount, 0);

      db.collection('Users').aggregate.mock.mockImplementation(() => ({ toArray: async () => [] }));
      const aggregate = await provider.execute(db, { collection: 'Users', operation: 'aggregate' });
      assert.equal(aggregate.rowCount, 0);

      db.collection('Users').countDocuments.mock.mockImplementation(async () => 0);
      const count = await provider.execute(db, { collection: 'Users', operation: 'countdocuments' });
      assert.equal(count.rowCount, 1);

      db.collection('Users').distinct.mock.mockImplementation(async () => []);
      const distinct = await provider.execute(db, {
        collection: 'Users',
        operation: 'distinct',
        query: { field: 'email' },
      });
      assert.equal(distinct.rowCount, 0);
    });

    it('covers distinct branch when filter is omitted', async () => {
      db.collection('Users').distinct.mock.mockImplementation(async () => ['a']);
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'distinct',
        query: { field: 'email' },
      });
      const [, filterArg] = db.collection('Users').distinct.mock.calls.at(-1).arguments;
      assert.deepEqual(filterArg, {});
      assert.equal(result.rowCount, 1);
    });

    it('uses zero fallbacks for insertmany and updatemany counts', async () => {
      db.collection('Users').insertMany.mock.mockImplementation(async () => ({ insertedIds: { 0: 'a' } }));
      const insertMany = await provider.execute(db, {
        collection: 'Users',
        operation: 'insertmany',
        query: [{ _id: 'a' }],
      });
      assert.equal(insertMany.rowCount, 0);

      db.collection('Users').updateMany.mock.mockImplementation(async () => ({ modifiedCount: 0, matchedCount: 0 }));
      const updateMany = await provider.execute(db, {
        collection: 'Users',
        operation: 'updatemany',
        query: { active: true },
        update: { $set: { active: false } },
      });
      assert.equal(updateMany.rowCount, 0);
    });

    it('uses zero fallback when deletemany omits deletedCount', async () => {
      db.collection('Users').deleteMany.mock.mockImplementation(async () => ({}));
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'deletemany',
        query: { stale: true },
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 0);
      assert.equal(result.data.deletedCount, undefined);
    });

    it('uses truthy deletedCount for deletemany rowCount', async () => {
      db.collection('Users').deleteMany.mock.mockImplementation(async () => ({ deletedCount: 3 }));
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'deletemany',
        query: { stale: true },
      });
      assert.equal(result.success, true);
      assert.equal(result.rowCount, 3);
    });

    it('uses zero fallbacks when modification counts are missing', async () => {
      db.collection('Users').insertOne.mock.mockImplementation(async () => ({ insertedId: 'x' }));
      const insert = await provider.execute(db, {
        collection: 'Users',
        operation: 'insertone',
        query: { _id: 'u1' },
      });
      assert.equal(insert.rowCount, 0);

      db.collection('Users').updateOne.mock.mockImplementation(async () => ({ modifiedCount: 0, matchedCount: 0 }));
      const update = await provider.execute(db, {
        collection: 'Users',
        operation: 'updateone',
        query: { _id: 'u1' },
        update: { $set: { name: 'A' } },
      });
      assert.equal(update.rowCount, 0);

      db.collection('Users').deleteOne.mock.mockImplementation(async () => ({}));
      const del = await provider.execute(db, {
        collection: 'Users',
        operation: 'deleteone',
        query: { _id: 'u1' },
      });
      assert.equal(del.rowCount, 0);
    });

    it('returns error when collection or operation is missing', async () => {
      const missingCollection = await provider.execute(db, { operation: 'findone' });
      assert.equal(missingCollection.success, false);
      assert.match(missingCollection.error, /Collection and operation are required/);

      const unsupported = await provider.execute(db, { collection: 'Users', operation: 'unsupported' });
      assert.equal(unsupported.success, false);
      assert.match(unsupported.error, /Unsupported MongoDB operation/);
    });

    it('returns undefined code when error has no code metadata', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => {
        throw new Error('plain');
      });
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'findone',
        query: { _id: 'u1' },
      });
      assert.equal(result.success, false);
      assert.equal(result.code, undefined);
    });

    it('returns codeName when error code is missing', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => {
        const err = new Error('duplicate');
        err.codeName = 'DuplicateKey';
        throw err;
      });
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'findone',
        query: { _id: 'u1' },
      });
      assert.equal(result.success, false);
      assert.equal(result.code, 'DuplicateKey');
    });

    it('returns error result when operation throws', async () => {
      db.collection('Users').findOne.mock.mockImplementation(async () => {
        const err = new Error('boom');
        err.code = 11000;
        throw err;
      });
      const result = await provider.execute(db, {
        collection: 'Users',
        operation: 'findone',
        query: { _id: 'u1' },
      });
      assert.equal(result.success, false);
      assert.equal(result.error, 'boom');
      assert.equal(result.code, 11000);
    });
  });

  describe('executeTransaction', () => {
    it('runs supported operations inside a session transaction', async () => {
      const db = await provider.getDatabase('txn', 'mongodb://localhost/txn');
      let sessionRef;
      db.client.startSession.mock.mockImplementation(() => {
        sessionRef = {
          withTransaction: mock.fn(async (fn) => fn()),
          endSession: mock.fn(async () => {}),
        };
        return sessionRef;
      });
      const result = await provider.executeTransaction(db, [
        { collection: 'Users', operation: 'insertone', query: { _id: 'txn-1' } },
        { collection: 'Users', operation: 'updateone', query: { _id: 'txn-1' }, update: { $set: { name: 'Txn' } } },
        { collection: 'Users', operation: 'deleteone', query: { _id: 'txn-1' } },
      ], Date.now());
      assert.equal(result.success, true);
      assert.equal(result.data.length, 3);
      assert.equal(db.client.startSession.mock.calls.length, 1);
      assert.equal(sessionRef.endSession.mock.calls.length, 1);
    });

    it('returns cached database without reconnecting', async () => {
      const db1 = await provider.getDatabase('cache-hit', 'mongodb://localhost/cache-hit');
      const db2 = await provider.getDatabase('cache-hit', 'mongodb://localhost/cache-hit');
      assert.equal(db1, db2);
      assert.equal(mongoClients.length, 1);
    });

    it('ends session when withTransaction throws before operations run', async () => {
      const db = await provider.getDatabase('txn-outer-fail', 'mongodb://localhost/txn-outer-fail');
      let sessionRef;
      db.client.startSession.mock.mockImplementation(() => {
        sessionRef = {
          withTransaction: mock.fn(async () => { throw new Error('outer txn failed'); }),
          endSession: mock.fn(async () => {}),
        };
        return sessionRef;
      });
      await assert.rejects(
        () => provider.executeTransaction(db, [
          { collection: 'Users', operation: 'insertone', query: { _id: 'x' } },
        ], Date.now()),
        /outer txn failed/
      );
      assert.equal(sessionRef.endSession.mock.calls.length, 1);
    });

    it('throws for unsupported transaction operations and ends the session', async () => {
      const db = await provider.getDatabase('txn-bad', 'mongodb://localhost/txn-bad');
      let sessionRef;
      db.client.startSession.mock.mockImplementation(() => {
        sessionRef = {
          withTransaction: mock.fn(async (fn) => fn()),
          endSession: mock.fn(async () => {}),
        };
        return sessionRef;
      });
      await assert.rejects(
        () => provider.executeTransaction(db, [
          { collection: 'Users', operation: 'find', query: {} },
        ], Date.now()),
        /Transaction operation find not supported/
      );
      assert.equal(sessionRef.endSession.mock.calls.length, 1);
    });
  });

  describe('closeAll', () => {
    it('closes all clients and clears caches', async () => {
      await provider.getDatabase('close-1', 'mongodb://localhost/c1');
      await provider.getDatabase('close-2', 'mongodb://localhost/c2');
      assert.equal(provider.clients.size, 2);
      assert.equal(provider.databases.size, 2);
      await provider.closeAll();
      assert.equal(provider.clients.size, 0);
      assert.equal(provider.databases.size, 0);
      assert.equal(mongoClients.every((client) => client.close.mock.calls.length === 1), true);
    });
  });
});