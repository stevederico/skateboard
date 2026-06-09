import { MongoClient } from 'mongodb';
import type { Db, Document } from 'mongodb';
import type {
  AuthQuery,
  AuthRecord,
  AuthUpdate,
  DatabaseProvider,
  ExecuteResult,
  ExecuteSuccess,
  InsertResult,
  MongoOperation,
  MongoQueryObject,
  QueryObject,
  UpdateResult,
  User,
  UserQuery,
  UserUpdate,
  WebhookEventRecord,
} from '../types.ts';

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
export class MongoDBProvider implements DatabaseProvider<Db> {
  /** Cached MongoClient instances keyed by `${dbName}_${connectionString}`. */
  clients: Map<string, MongoClient>;
  /** Cached Db handles keyed by `${dbName}_${connectionString}`. */
  databases: Map<string, Db>;

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
   */
  async initialize(): Promise<void> {
    // Provider ready for connections
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
   * @param dbName - Database name
   * @param connectionString - MongoDB connection URI (required)
   * @returns MongoDB database instance
   * @throws If connectionString is not provided or connection fails
   */
  async getDatabase(dbName: string, connectionString?: string | null): Promise<Db> {
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

    return this.databases.get(cacheKey)!;
  }

  /**
   * Create collections and indexes if they don't exist
   *
   * Creates Users and Auths collections with unique email indexes.
   * Checks existing collections before creation.
   *
   * @async
   * @param db - MongoDB database instance
   */
  async ensureMongoDBSchema(db: Db): Promise<void> {
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

    if (!collectionNames.includes('WebhookEvents')) {
      await db.createCollection('WebhookEvents');
      // Create unique index on event_id
      await db.collection('WebhookEvents').createIndex({ event_id: 1 }, { unique: true });
    }
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Uses native MongoDB document structure (subscription and usage as nested objects).
   * Supports MongoDB projection syntax for field filtering.
   *
   * @async
   * @param db - MongoDB database instance
   * @param query - Query object with _id or email
   * @param [query._id] - User ID to search
   * @param [query.email] - Email to search
   * @param [projection={}] - MongoDB projection object
   * @returns User document with nested subscription and usage, or null
   */
  async findUser(db: Db, query: UserQuery, projection: Record<string, unknown> = {}): Promise<User | null> {
    const { _id, email } = query;
    let mongoQuery: Record<string, unknown> = {};

    if (_id) {
      mongoQuery._id = _id;
    } else if (email) {
      mongoQuery.email = email;
    } else {
      return null;
    }

    const user = await db.collection('Users').findOne(mongoQuery, { projection }) as User | null;
    return user;
  }

  /**
   * Insert new user document
   *
   * Creates user with native nested structure. MongoDB automatically
   * handles subscription and usage as nested objects.
   *
   * @async
   * @param db - MongoDB database instance
   * @param userData - User data to insert
   * @param userData._id - User ID (UUID)
   * @param userData.email - User email (unique)
   * @param userData.name - User name
   * @param userData.created_at - Unix timestamp
   * @param [userData.subscription] - Subscription object
   * @param [userData.usage] - Usage object
   * @returns MongoDB insertedId
   * @throws If email already exists
   */
  async insertUser(db: Db, userData: User): Promise<InsertResult> {
    const result = await db.collection('Users').insertOne(userData as unknown as Document);
    return { insertedId: result.insertedId };
  }

  /**
   * Update user document by ID
   *
   * Uses MongoDB update operators ($set, $inc, etc.) natively.
   * Supports nested field updates without flattening.
   *
   * @async
   * @param db - MongoDB database instance
   * @param query - Query object with _id
   * @param query._id - User ID to update
   * @param update - MongoDB update operators ($set, $inc, etc.)
   * @returns Number of modified documents
   */
  async updateUser(db: Db, query: UserQuery, update: UserUpdate): Promise<UpdateResult> {
    const { _id } = query;
    const result = await db.collection('Users').updateOne({ _id }, update as Document);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Find authentication document by email
   *
   * @async
   * @param db - MongoDB database instance
   * @param query - Query object with email
   * @param query.email - Email to search
   * @returns Auth document with password hash, or null
   */
  async findAuth(db: Db, query: AuthQuery): Promise<AuthRecord | null> {
    const { email } = query;
    const auth = await db.collection('Auths').findOne({ email }) as AuthRecord | null;
    return auth;
  }

  /**
   * Insert authentication document with hashed password
   *
   * @async
   * @param db - MongoDB database instance
   * @param authData - Auth data to insert
   * @param authData.email - User email (unique)
   * @param authData.password - Bcrypt hashed password
   * @param authData.userID - User ID reference
   * @returns MongoDB insertedId
   * @throws If email already exists
   */
  async insertAuth(db: Db, authData: AuthRecord): Promise<InsertResult> {
    const result = await db.collection('Auths').insertOne(authData as unknown as Document);
    return { insertedId: result.insertedId };
  }

  /**
   * Update authentication document (password only)
   *
   * @async
   * @param db - MongoDB database instance
   * @param query - Query object with email
   * @param query.email - Email of auth document to update
   * @param update - Fields to update
   * @param update.password - New password hash
   * @returns Number of modified documents
   */
  async updateAuth(db: Db, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult> {
    const { email } = query;
    const { password } = update;
    if (typeof password !== 'string') return { modifiedCount: 0 };
    const result = await db.collection('Auths').updateOne({ email }, { $set: { password } });
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * @async
   * @param db - MongoDB database instance
   * @param eventId - Stripe event ID
   * @returns Webhook event document or null if not found
   */
  async findWebhookEvent(db: Db, eventId: string): Promise<WebhookEventRecord | null> {
    return await db.collection('WebhookEvents').findOne({ event_id: eventId }) as WebhookEventRecord | null;
  }

  /**
   * Insert webhook event record for idempotency tracking
   *
   * @async
   * @param db - MongoDB database instance
   * @param eventId - Stripe event ID (unique)
   * @param eventType - Stripe event type
   * @param processedAt - Unix timestamp
   * @returns MongoDB insertedId
   */
  async insertWebhookEvent(db: Db, eventId: string, eventType: string, processedAt: number): Promise<InsertResult> {
    const result = await db.collection('WebhookEvents').insertOne({
      event_id: eventId,
      event_type: eventType,
      processed_at: processedAt
    });
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
   * @param db - MongoDB database instance
   * @param queryObject - Operation configuration
   * @param queryObject.collection - Collection name (required)
   * @param queryObject.operation - Operation type (required)
   * @param [queryObject.query] - Query filter
   * @param [queryObject.update] - Update document
   * @param [queryObject.pipeline] - Aggregation pipeline
   * @param [queryObject.options={}] - MongoDB options
   * @param [queryObject.transaction] - Transaction operations
   * @returns Operation result
   * @throws If collection or operation is missing
   */
  async execute(db: Db, queryObject: QueryObject): Promise<ExecuteResult> {
    const startTime = Date.now();

    try {
      const { collection, operation, query, update, pipeline, options = {}, transaction } = queryObject as MongoQueryObject;
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
          result = await coll.insertOne(query as Document, options);
          data = { insertedId: result.insertedId };
          rowCount = result.insertedCount || 0;
          break;

        case 'insertmany':
          result = await coll.insertMany(query as unknown as Document[], options);
          data = { insertedIds: result.insertedIds, insertedCount: result.insertedCount };
          rowCount = result.insertedCount || 0;
          break;

        case 'updateone':
          result = await coll.updateOne(query as Document, update as Document, options);
          data = {
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            upsertedId: result.upsertedId
          };
          rowCount = result.modifiedCount || 0;
          break;

        case 'updatemany':
          result = await coll.updateMany(query as Document, update as Document, options);
          data = {
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            upsertedCount: result.upsertedCount
          };
          rowCount = result.modifiedCount || 0;
          break;

        case 'deleteone':
          result = await coll.deleteOne(query as Document, options);
          data = { deletedCount: result.deletedCount };
          rowCount = result.deletedCount || 0;
          break;

        case 'deletemany':
          result = await coll.deleteMany(query as Document, options);
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
          data = await coll.distinct(query!.field as string, (query!.filter || {}) as Document, options);
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
      const err = error as Error & { code?: string | number; codeName?: string };
      return {
        success: false,
        error: err.message,
        code: err.code || err.codeName,
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
   * @param db - MongoDB database instance
   * @param operations - Operations to execute
   * @param startTime - Transaction start timestamp for metadata
   * @returns Transaction results
   * @throws Throws on any operation failure
   */
  async executeTransaction(db: Db, operations: MongoOperation[], startTime: number): Promise<ExecuteSuccess> {
    const session = db.client.startSession();

    try {
      const results: { operation: string; insertedId?: unknown; modifiedCount?: number; deletedCount?: number }[] = [];

      await session.withTransaction(async () => {
        for (const operation of operations) {
          const { collection, operation: op, query, update, options = {} } = operation;
          const coll = db.collection(collection);

          let result;
          switch (op.toLowerCase()) {
            case 'insertone':
              result = await coll.insertOne(query as Document, { ...options, session });
              results.push({ operation: op, insertedId: result.insertedId });
              break;
            case 'updateone':
              result = await coll.updateOne(query as Document, update as Document, { ...options, session });
              results.push({ operation: op, modifiedCount: result.modifiedCount });
              break;
            case 'deleteone':
              result = await coll.deleteOne(query as Document, { ...options, session });
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
   */
  async closeAll(): Promise<void> {
    for (const [cacheKey, client] of this.clients) {
      await client.close();
    }
    this.clients.clear();
    this.databases.clear();
  }
}
