import { SQLiteProvider } from './sqlite.js';
import { PostgreSQLProvider } from './postgres.js';
import { MongoDBProvider } from './mongodb.js';

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
   * @param {string} dbType - Database type: 'sqlite', 'postgresql'/'postgres', 'mongodb'/'mongo'
   * @returns {Promise<SQLiteProvider|PostgreSQLProvider|MongoDBProvider>} Initialized database provider
   * @throws {Error} If dbType is not supported
   */
  async getProvider(dbType) {
    if (!this.providers.has(dbType)) {
      let provider;
      
      switch (dbType.toLowerCase()) {
        case 'sqlite':
          provider = new SQLiteProvider();
          break;
        case 'postgresql':
        case 'postgres':
          provider = new PostgreSQLProvider();
          break;
        case 'mongodb':
        case 'mongo':
          provider = new MongoDBProvider();
          break;
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }

      await provider.initialize();
      this.providers.set(dbType, provider);
    }

    return this.providers.get(dbType);
  }

  /**
   * Get or create database connection with caching
   *
   * Returns cached connection if available, otherwise creates new connection.
   * Connection key combines dbType, dbName, and connectionString for uniqueness.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string|null} [connectionString=null] - Connection string or file path
   * @returns {Promise<{provider: Object, database: Object}>} Provider and database connection
   * @throws {Error} If provider initialization fails
   */
  async getDatabase(dbType, dbName, connectionString = null) {
    const provider = await this.getProvider(dbType);
    const connectionKey = `${dbType}_${dbName}_${connectionString || 'default'}`;

    if (!this.activeConnections.has(connectionKey)) {
      const database = await provider.getDatabase(dbName, connectionString);
      this.activeConnections.set(connectionKey, { provider, database });
    }

    return this.activeConnections.get(connectionKey);
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Unified interface method that delegates to provider-specific implementation.
   * Returns user with nested subscription object.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} query - Query object with _id or email
   * @param {string} [query._id] - User ID to search
   * @param {string} [query.email] - Email to search
   * @param {Object} [projection={}] - Fields to include/exclude in result
   * @returns {Promise<Object|null>} User object with subscription nested, or null if not found
   * @throws {Error} If database operation fails
   */
  async findUser(dbType, dbName, connectionString, query, projection = {}) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findUser(database, query, projection);
  }

  /**
   * Insert new user with hashed password and default subscription
   *
   * Creates user and associated subscription record. Password must be pre-hashed.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} userData - User data to insert
   * @param {string} userData.email - User email (unique)
   * @param {string} userData.name - User name
   * @param {string} userData.password - Bcrypt hashed password
   * @returns {Promise<Object>} Inserted user object with subscription nested
   * @throws {Error} If user already exists or database operation fails
   */
  async insertUser(dbType, dbName, connectionString, userData) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertUser(database, userData);
  }

  /**
   * Update user fields by ID or email
   *
   * Updates user record and/or nested subscription fields.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} query - Query object with _id or email
   * @param {string} [query._id] - User ID to update
   * @param {string} [query.email] - Email to update
   * @param {Object} update - Update object with fields to modify
   * @param {Object} [update.subscription] - Subscription fields to update
   * @returns {Promise<Object|null>} Updated user object, or null if not found
   * @throws {Error} If database operation fails
   */
  async updateUser(dbType, dbName, connectionString, query, update) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.updateUser(database, query, update);
  }

  /**
   * Find authentication record by user ID or token
   *
   * Looks up auth record containing CSRF token and metadata.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} query - Query object with userId or csrfToken
   * @param {string} [query.userId] - User ID to search
   * @param {string} [query.csrfToken] - CSRF token to search
   * @returns {Promise<Object|null>} Auth record or null if not found
   * @throws {Error} If database operation fails
   */
  async findAuth(dbType, dbName, connectionString, query) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.findAuth(database, query);
  }

  /**
   * Insert authentication record with CSRF token
   *
   * Creates new auth record for user session management.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} authData - Auth data to insert
   * @param {string} authData.userId - User ID this auth belongs to
   * @param {string} authData.csrfToken - CSRF protection token
   * @returns {Promise<Object>} Inserted auth record
   * @throws {Error} If database operation fails
   */
  async insertAuth(dbType, dbName, connectionString, authData) {
    const { provider, database } = await this.getDatabase(dbType, dbName, connectionString);
    return await provider.insertAuth(database, authData);
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * Checks if a Stripe webhook event has already been processed to prevent
   * duplicate processing on retries.
   *
   * @async
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {string} eventId - Stripe event ID to check
   * @returns {Promise<Object|null>} Webhook event record or null if not processed
   * @throws {Error} If database operation fails
   */
  async findWebhookEvent(dbType, dbName, connectionString, eventId) {
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
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {string} eventId - Stripe event ID (unique)
   * @param {string} eventType - Stripe event type
   * @param {number} processedAt - Unix timestamp when processed
   * @returns {Promise<Object>} Inserted event record
   * @throws {Error} If database operation fails
   */
  async insertWebhookEvent(dbType, dbName, connectionString, eventId, eventType, processedAt) {
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
   * @param {string} dbType - Database type
   * @param {string} dbName - Database name
   * @param {string} connectionString - Connection string or file path
   * @param {Object} queryObject - Provider-specific query object
   * @returns {Promise<any>} Query result in provider-specific format
   * @throws {Error} If database operation fails
   */
  async executeQuery(dbType, dbName, connectionString, queryObject) {
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
   * @returns {Promise<void>}
   */
  async closeAll() {
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
 * @type {DatabaseManager}
 * @example
 * import { databaseManager } from './adapters/manager.js';
 *
 * const user = await databaseManager.findUser('sqlite', 'MyApp', './db.db', { email: 'user@example.com' });
 */
export const databaseManager = new DatabaseManager();