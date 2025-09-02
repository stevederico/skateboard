import { MongoClient } from 'mongodb';

export class MongoDBProvider {
  constructor() {
    this.clients = new Map();
    this.databases = new Map();
  }

  async initialize() {
    console.log('MongoDB provider initialized');
  }

  async getDatabase(dbName, connectionString) {
    const cacheKey = `${dbName}_${connectionString}`;
    
    if (!this.databases.has(cacheKey)) {
      if (!connectionString) {
        throw new Error(`Connection string required for MongoDB database: ${dbName}`);
      }

      const client = new MongoClient(connectionString, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await client.connect();
      const db = client.db(dbName);
      
      this.clients.set(cacheKey, client);
      this.databases.set(cacheKey, db);
      
      await this.ensureMongoDBSchema(db);
    }
    
    return this.databases.get(cacheKey);
  }

  async ensureMongoDBSchema(db) {
    // Create collections if they don't exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('users')) {
      await db.createCollection('users');
      // Create unique index on email
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
    }
    
    if (!collectionNames.includes('auths')) {
      await db.createCollection('auths');
      // Create unique index on email
      await db.collection('auths').createIndex({ email: 1 }, { unique: true });
    }
  }

  async findUser(db, query, projection = {}) {
    const { _id, email } = query;
    let mongoQuery = {};
    
    if (_id) {
      mongoQuery._id = _id;
    } else if (email) {
      mongoQuery.email = email;
    } else {
      return null;
    }

    const user = await db.collection('users').findOne(mongoQuery, { projection });
    return user;
  }

  async insertUser(db, userData) {
    const result = await db.collection('users').insertOne(userData);
    return { insertedId: result.insertedId };
  }

  async updateUser(db, query, update) {
    const { _id } = query;
    const result = await db.collection('users').updateOne({ _id }, update);
    return { modifiedCount: result.modifiedCount };
  }

  async findAuth(db, query) {
    const { email } = query;
    const auth = await db.collection('auths').findOne({ email });
    return auth;
  }

  async insertAuth(db, authData) {
    const result = await db.collection('auths').insertOne(authData);
    return { insertedId: result.insertedId };
  }

  async execute(db, queryObject) {
    const startTime = Date.now();
    
    try {
      const { collection, operation, query, update, pipeline, options = {}, transaction } = queryObject;
      
      // Handle transactions
      if (transaction && Array.isArray(transaction)) {
        return this.executeTransaction(db, transaction, startTime);
      }
      
      if (!collection || !operation) {
        throw new Error('Collection and operation are required for MongoDB queries');
      }

      const coll = db.collection(collection);
      let result;
      let data;
      let rowCount = 0;

      switch (operation.toLowerCase()) {
        case 'findone':
          data = await coll.findOne(query || {}, options);
          rowCount = data ? 1 : 0;
          break;
          
        case 'find':
          const cursor = coll.find(query || {}, options);
          data = await cursor.toArray();
          rowCount = data.length;
          break;
          
        case 'insertone':
          result = await coll.insertOne(query, options);
          data = { insertedId: result.insertedId };
          rowCount = result.insertedCount || 0;
          break;
          
        case 'insertmany':
          result = await coll.insertMany(query, options);
          data = { insertedIds: result.insertedIds, insertedCount: result.insertedCount };
          rowCount = result.insertedCount || 0;
          break;
          
        case 'updateone':
          result = await coll.updateOne(query, update, options);
          data = { 
            modifiedCount: result.modifiedCount, 
            matchedCount: result.matchedCount,
            upsertedId: result.upsertedId 
          };
          rowCount = result.modifiedCount || 0;
          break;
          
        case 'updatemany':
          result = await coll.updateMany(query, update, options);
          data = { 
            modifiedCount: result.modifiedCount, 
            matchedCount: result.matchedCount,
            upsertedCount: result.upsertedCount 
          };
          rowCount = result.modifiedCount || 0;
          break;
          
        case 'deleteone':
          result = await coll.deleteOne(query, options);
          data = { deletedCount: result.deletedCount };
          rowCount = result.deletedCount || 0;
          break;
          
        case 'deletemany':
          result = await coll.deleteMany(query, options);
          data = { deletedCount: result.deletedCount };
          rowCount = result.deletedCount || 0;
          break;
          
        case 'aggregate':
          const aggCursor = coll.aggregate(pipeline || [], options);
          data = await aggCursor.toArray();
          rowCount = data.length;
          break;
          
        case 'countdocuments':
          data = await coll.countDocuments(query || {}, options);
          rowCount = 1;
          break;
          
        case 'distinct':
          data = await coll.distinct(query.field, query.filter || {}, options);
          rowCount = data.length;
          break;
          
        default:
          throw new Error(`Unsupported MongoDB operation: ${operation}`);
      }

      return {
        success: true,
        data,
        rowCount,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'mongodb'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.codeName,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'mongodb'
        }
      };
    }
  }

  async executeTransaction(db, operations, startTime) {
    const session = db.client.startSession();
    
    try {
      const results = [];
      
      await session.withTransaction(async () => {
        for (const operation of operations) {
          const { collection, operation: op, query, update, options = {} } = operation;
          const coll = db.collection(collection);
          
          let result;
          switch (op.toLowerCase()) {
            case 'insertone':
              result = await coll.insertOne(query, { ...options, session });
              results.push({ operation: op, insertedId: result.insertedId });
              break;
            case 'updateone':
              result = await coll.updateOne(query, update, { ...options, session });
              results.push({ operation: op, modifiedCount: result.modifiedCount });
              break;
            case 'deleteone':
              result = await coll.deleteOne(query, { ...options, session });
              results.push({ operation: op, deletedCount: result.deletedCount });
              break;
            default:
              throw new Error(`Transaction operation ${op} not supported`);
          }
        }
      });
      
      return {
        success: true,
        data: results,
        rowCount: results.length,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'mongodb'
        }
      };
    } catch (error) {
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async closeAll() {
    for (const [cacheKey, client] of this.clients) {
      await client.close();
    }
    this.clients.clear();
    this.databases.clear();
  }
}