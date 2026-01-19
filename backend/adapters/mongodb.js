import { MongoClient } from 'mongodb';

/**
 * MongoDB database provider with connection pooling
 *
 * Manages multiple MongoDB client connections with automatic collection creation.
 * Uses native document structure (no flattening of subscription/usage objects).
 *
 * Features:
 * - Connection pooling (max 10 connections)
 * - Automatic collection and index creation
 * - Native nested document support
 * - Rich query operations (find, aggregate, distinct, etc.)
 * - Transaction support with sessions
 *
 * @class
 */
export class MongoDBProvider {
  /**
   * Create MongoDB provider with empty client and database caches
   */
  constructor() {
    this.clients = new Map();
    this.databases = new Map();
  }

  /**
   * Initialize MongoDB provider
   *
   * No-op initialization for interface compatibility.
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log('MongoDB provider initialized');
  }

  /**
   * Get or create MongoDB database connection with caching
   *
   * Creates MongoClient with connection pooling. Cache key combines dbName
   * and connectionString for unique identification. Pool configuration:
   * - maxPoolSize: 10 connections
   * - serverSelectionTimeoutMS: 5000
   * - socketTimeoutMS: 45000
   *
   * @async
   * @param {string} dbName - Database name
   * @param {string} connectionString - MongoDB connection URI (required)
   * @returns {Promise<Db>} MongoDB database instance
   * @throws {Error} If connectionString is not provided or connection fails
   */
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

  /**
   * Create collections and indexes if they don't exist
   *
   * Creates Users and Auths collections with unique email indexes.
   * Checks existing collections before creation.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @returns {Promise<void>}
   */
  async ensureMongoDBSchema(db) {
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    if (!collectionNames.includes('Users')) {
      await db.createCollection('Users');
      // Create unique index on email
      await db.collection('Users').createIndex({ email: 1 }, { unique: true });
    }

    if (!collectionNames.includes('Auths')) {
      await db.createCollection('Auths');
      // Create unique index on email
      await db.collection('Auths').createIndex({ email: 1 }, { unique: true });
    }
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Uses native MongoDB document structure (subscription and usage as nested objects).
   * Supports MongoDB projection syntax for field filtering.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} query - Query object with _id or email
   * @param {string} [query._id] - User ID to search
   * @param {string} [query.email] - Email to search
   * @param {Object} [projection={}] - MongoDB projection object
   * @returns {Promise<Object|null>} User document with nested subscription and usage, or null
   */
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

    const user = await db.collection('Users').findOne(mongoQuery, { projection });
    return user;
  }

  /**
   * Insert new user document
   *
   * Creates user with native nested structure. MongoDB automatically
   * handles subscription and usage as nested objects.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} userData - User data to insert
   * @param {string} userData._id - User ID (UUID)
   * @param {string} userData.email - User email (unique)
   * @param {string} userData.name - User name
   * @param {number} userData.created_at - Unix timestamp
   * @param {Object} [userData.subscription] - Subscription object
   * @param {Object} [userData.usage] - Usage object
   * @returns {Promise<{insertedId: ObjectId}>} MongoDB insertedId
   * @throws {Error} If email already exists
   */
  async insertUser(db, userData) {
    const result = await db.collection('Users').insertOne(userData);
    return { insertedId: result.insertedId };
  }

  /**
   * Update user document by ID
   *
   * Uses MongoDB update operators ($set, $inc, etc.) natively.
   * Supports nested field updates without flattening.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} query - Query object with _id
   * @param {string} query._id - User ID to update
   * @param {Object} update - MongoDB update operators ($set, $inc, etc.)
   * @returns {Promise<{modifiedCount: number}>} Number of modified documents
   */
  async updateUser(db, query, update) {
    const { _id } = query;
    const result = await db.collection('Users').updateOne({ _id }, update);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Find authentication document by email
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} query - Query object with email
   * @param {string} query.email - Email to search
   * @returns {Promise<Object|null>} Auth document with password hash, or null
   */
  async findAuth(db, query) {
    const { email } = query;
    const auth = await db.collection('Auths').findOne({ email });
    return auth;
  }

  /**
   * Insert authentication document with hashed password
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} authData - Auth data to insert
   * @param {string} authData.email - User email (unique)
   * @param {string} authData.password - Bcrypt hashed password
   * @param {string} authData.userID - User ID reference
   * @returns {Promise<{insertedId: ObjectId}>} MongoDB insertedId
   * @throws {Error} If email already exists
   */
  async insertAuth(db, authData) {
    const result = await db.collection('Auths').insertOne(authData);
    return { insertedId: result.insertedId };
  }

  /**
   * Execute custom MongoDB operation with unified response format
   *
   * Supports 11 operations: findone, find, insertone, insertmany, updateone,
   * updatemany, deleteone, deletemany, aggregate, countdocuments, distinct.
   * Supports transactions via transaction array.
   *
   * Response format includes success flag, data, rowCount, and metadata with timing.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Object} queryObject - Operation configuration
   * @param {string} queryObject.collection - Collection name (required)
   * @param {string} queryObject.operation - Operation type (required)
   * @param {Object} [queryObject.query] - Query filter
   * @param {Object} [queryObject.update] - Update document
   * @param {Array} [queryObject.pipeline] - Aggregation pipeline
   * @param {Object} [queryObject.options={}] - MongoDB options
   * @param {Array} [queryObject.transaction] - Transaction operations
   * @returns {Promise<{success: boolean, data: any, rowCount: number, metadata: Object}>} Operation result
   * @throws {Error} If collection or operation is missing
   */
  async execute(db, queryObject) {
    const startTime = Date.now();

    try {
      const { collection, operation, query, update, pipeline, options = {}, transaction } = queryObject;
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

  /**
   * Execute multiple MongoDB operations in a transaction
   *
   * Uses MongoDB sessions with withTransaction() for automatic retry logic.
   * Supports insertone, updateone, and deleteone operations.
   * All operations succeed or all fail atomically.
   *
   * @async
   * @param {Db} db - MongoDB database instance
   * @param {Array<{collection: string, operation: string, query: Object, update: Object, options: Object}>} operations - Operations to execute
   * @param {number} startTime - Transaction start timestamp for metadata
   * @returns {Promise<{success: boolean, data: Array, rowCount: number, metadata: Object}>} Transaction results
   * @throws {Error} Throws on any operation failure
   */
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

  /**
   * Close all MongoDB client connections and clear caches
   *
   * Gracefully closes all MongoClient connections. Call on application shutdown.
   *
   * @async
   * @returns {Promise<void>}
   */
  async closeAll() {
    for (const [cacheKey, client] of this.clients) {
      await client.close();
    }
    this.clients.clear();
    this.databases.clear();
  }
}