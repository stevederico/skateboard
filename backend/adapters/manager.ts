import { SQLiteProvider } from './sqlite.ts';
import type {
  DatabaseProvider,
  DatabaseConnection,
  User,
  UserQuery,
  UserUpdate,
  AuthRecord,
  AuthQuery,
  AuthUpdate,
  WebhookEventRecord,
  InsertResult,
  UpdateResult,
  DeleteResult,
  QueryObject,
  ExecuteResult
} from '../types.ts';

/**
 * Database manager implementing factory pattern for multi-database support
 *
 * Provides unified interface across SQLite, PostgreSQL, and MongoDB with:
 * - Singleton provider instances per database type
 * - Connection pooling and caching
 * - Consistent API regardless of underlying database
 *
 * @class
 */
class DatabaseManager {
  declare providers: Map<string, DatabaseProvider>;
  declare activeConnections: Map<string, DatabaseConnection>;

  /**
   * Create database manager with empty provider and connection caches
   */
  constructor() {
    this.providers = new Map();
    this.activeConnections = new Map();
  }

  /**
   * Get or create database provider for specified type
   *
   * Lazily instantiates providers on first use. Caches provider instances
   * to avoid duplicate initialization.
   *
   * @async
   * @param dbType - Database type: 'sqlite', 'postgresql'/'postgres', 'mongodb'/'mongo'
   * @returns Initialized database provider
   * @throws {Error} If dbType is not supported
   */
  async getProvider(dbType: string): Promise<DatabaseProvider> {
    if (!this.providers.has(dbType)) {
      let provider: DatabaseProvider;
      
      switch (dbType.toLowerCase()) {
        case 'sqlite':
          provider = new SQLiteProvider();
          break;
        case 'postgresql':
        case 'postgres': {
          const { PostgreSQLProvider } = await import('./postgres.ts');
          provider = new PostgreSQLProvider();
          break;
        }
        case 'mongodb':
        case 'mongo': {
          const { MongoDBProvider } = await import('./mongodb.ts');
          provider = new MongoDBProvider();
          break;
        }
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }

      await provider.initialize();
      this.providers.set(dbType, provider);
    }

    return this.providers.get(dbType)!;
  }

  /**
   * Get or create database connection with caching
   *
   * Returns cached connection if available, otherwise creates new connection.
   * Connection key combines dbType, dbName, and connectionString for uniqueness.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param [connectionString=null] - Connection string or file path
   * @returns Provider and database connection
   * @throws {Error} If provider initialization fails
   */
  async getDatabase(dbType: string, dbName: string, connectionString: string | null = null): Promise<DatabaseConnection> {
    const provider = await this.getProvider(dbType);
    const connectionKey = `${dbType}_${dbName}_${connectionString || 'default'}`;

    if (!this.activeConnections.has(connectionKey)) {
      const database = await provider.getDatabase(dbName, connectionString);
      this.activeConnections.set(connectionKey, { provider, database });
    }

    return this.activeConnections.get(connectionKey)!;
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Unified interface method that delegates to provider-specific implementation.
   * Returns user with nested subscription object.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param query - Query object with _id or email
   * @param [query._id] - User ID to search
   * @param [query.email] - Email to search
   * @param [projection={}] - Fields to include/exclude in result
   * @returns User object with subscription nested, or null if not found
   * @throws {Error} If database operation fails
   */
  async findUser(dbType: string, dbName: string, connectionString: string, query: UserQuery, projection: Record<string, unknown> = {}): Promise<User | null> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findUser(database, query, projection);
  }

  /**
   * Insert new user with hashed password and default subscription
   *
   * Creates user and associated subscription record. Password must be pre-hashed.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param userData - User data to insert
   * @param userData.email - User email (unique)
   * @param userData.name - User name
   * @returns Insert result with inserted ID
   * @throws {Error} If user already exists or database operation fails
   */
  async insertUser(dbType: string, dbName: string, connectionString: string, userData: User): Promise<InsertResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertUser(database, userData);
  }

  /**
   * Update user fields by ID or email
   *
   * Updates user record and/or nested subscription fields.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param query - Query object with _id or email
   * @param [query._id] - User ID to update
   * @param [query.email] - Email to update
   * @param update - Update object with fields to modify
   * @param [update.$set.subscription] - Subscription fields to update
   * @returns Update result with modified count
   * @throws {Error} If database operation fails
   */
  async updateUser(dbType: string, dbName: string, connectionString: string, query: UserQuery, update: UserUpdate): Promise<UpdateResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.updateUser(database, query, update);
  }

  /**
   * Delete user by ID or email
   *
   * Unified interface method that delegates to provider-specific implementation.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param query - Query object with _id or email
   * @param [query._id] - User ID to delete
   * @param [query.email] - Email to delete
   * @returns Delete result with deleted count (0 when nothing matched)
   * @throws {Error} If database operation fails
   */
  async deleteUser(dbType: string, dbName: string, connectionString: string, query: UserQuery): Promise<DeleteResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.deleteUser(database, query);
  }

  /**
   * Find authentication record by email
   *
   * Looks up credential record containing password hash and user ID.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param query - Query object with email
   * @param query.email - Email to search
   * @returns Auth record or null if not found
   * @throws {Error} If database operation fails
   */
  async findAuth(dbType: string, dbName: string, connectionString: string, query: AuthQuery): Promise<AuthRecord | null> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findAuth(database, query);
  }

  /**
   * Insert authentication record with password hash
   *
   * Creates new credential record for user signin.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param authData - Auth data to insert
   * @param authData.email - Email this auth belongs to
   * @param authData.password - Password hash
   * @param authData.userID - Owning user's ID
   * @returns Insert result with inserted ID
   * @throws {Error} If database operation fails
   */
  async insertAuth(dbType: string, dbName: string, connectionString: string, authData: AuthRecord): Promise<InsertResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertAuth(database, authData);
  }

  /**
   * Update authentication record (currently password only)
   *
   * Used by lazy password-hash migration on successful login.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param query - Query object with email
   * @param query.email - Email of auth record to update
   * @param update - Fields to update
   * @param update.password - New password hash
   * @returns Number of modified rows
   */
  async updateAuth(dbType: string, dbName: string, connectionString: string, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.updateAuth(database, query, update);
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * Checks if a Stripe webhook event has already been processed to prevent
   * duplicate processing on retries.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param eventId - Stripe event ID to check
   * @returns Webhook event record or null if not processed
   * @throws {Error} If database operation fails
   */
  async findWebhookEvent(dbType: string, dbName: string, connectionString: string, eventId: string): Promise<WebhookEventRecord | null> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findWebhookEvent(database, eventId);
  }

  /**
   * Insert webhook event record for idempotency tracking
   *
   * Records that a Stripe webhook event has been processed to prevent
   * duplicate processing on retries.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param eventId - Stripe event ID (unique)
   * @param eventType - Stripe event type
   * @param processedAt - Unix timestamp when processed
   * @returns Insert result with inserted ID
   * @throws {Error} If database operation fails
   */
  async insertWebhookEvent(dbType: string, dbName: string, connectionString: string, eventId: string, eventType: string, processedAt: number): Promise<InsertResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertWebhookEvent(database, eventId, eventType, processedAt);
  }

  /**
   * Execute custom query operation
   *
   * Generic query executor for provider-specific operations.
   * Query format varies by database type.
   *
   * @async
   * @param dbType - Database type
   * @param dbName - Database name
   * @param connectionString - Connection string or file path
   * @param queryObject - Provider-specific query object
   * @returns Query result in provider-specific format
   * @throws {Error} If database operation fails
   */
  async executeQuery(dbType: string, dbName: string, connectionString: string, queryObject: QueryObject): Promise<ExecuteResult> {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.execute(database, queryObject);
  }

  /**
   * Close all database connections and clear caches
   *
   * Cleanup method that closes all provider connections and clears
   * internal Maps. Call on application shutdown.
   *
   * @async
   */
  async closeAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.closeAll();
    }
    this.providers.clear();
    this.activeConnections.clear();
  }
}

/**
 * Singleton database manager instance
 *
 * Pre-instantiated manager for application-wide database access.
 * Import and use directly - no need to instantiate DatabaseManager.
 *
 * @example
 * import { databaseManager } from './adapters/manager.ts';
 *
 * const user = await databaseManager.findUser('sqlite', 'MyApp', './db.db', { email: 'user@example.com' });
 */
export const databaseManager = new DatabaseManager();
