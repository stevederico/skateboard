import { DatabaseSync as Database } from "node:sqlite";
import { mkdir } from 'node:fs';
import { promisify } from 'node:util';

/**
 * SQLite database provider using Node.js built-in DatabaseSync
 *
 * Manages multiple SQLite connections with WAL mode for concurrency.
 * Automatically creates schema on first connection. Stores databases
 * in ./databases directory by default.
 *
 * Features:
 * - WAL journal mode for better concurrency
 * - Automatic schema creation
 * - Connection caching per database name
 * - Nested object transformation (subscription, usage)
 * - Transaction support
 *
 * @class
 */
export class SQLiteProvider {
  /**
   * Create SQLite provider with empty database cache
   */
  constructor() {
    this.databases = new Map();
  }

  /**
   * Initialize SQLite provider by creating databases directory
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.initializeSQLite();
  }

  /**
   * Create ./databases directory if it doesn't exist
   *
   * Uses recursive option to create parent directories. Ignores EEXIST errors.
   *
   * @async
   * @returns {Promise<void>}
   */
  async initializeSQLite() {
    try {
      await promisify(mkdir)('./databases', { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error("Failed to create databases directory:", err);
      }
    }
  }

  /**
   * Create database schema if tables don't exist
   *
   * Creates Users and Auths tables with indexes. Flattens nested subscription
   * and usage objects into columns (subscription_stripeID, usage_count, etc).
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @returns {void}
   */
  async ensureSQLiteSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Users (
        _id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        subscription_stripeID TEXT,
        subscription_expires INTEGER,
        subscription_status TEXT,
        usage_count INTEGER DEFAULT 0,
        usage_reset_at INTEGER
      )
    `);

    // Create Auths table
    db.exec(`
      CREATE TABLE IF NOT EXISTS Auths (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        userID TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES Users(_id)
      )
    `);

    // Create indexes
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON Auths(email)`);

    // Create WebhookEvents table for idempotency
    db.exec(`
      CREATE TABLE IF NOT EXISTS WebhookEvents (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        processed_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Get or create SQLite database connection with caching
   *
   * Opens database with WAL mode, NORMAL synchronous, and memory temp store
   * for optimal performance. Creates schema on first connection.
   *
   * @param {string} dbName - Database name for cache key
   * @param {string|null} [connectionString=null] - File path, defaults to ./databases/{dbName}.db
   * @returns {Database} SQLite DatabaseSync instance
   */
  getDatabase(dbName, connectionString = null) {
    if (!this.databases.has(dbName)) {
      const dbPath = connectionString || `./databases/${dbName}.db`;
      const db = new Database(dbPath);
      
      // Enable WAL mode for better concurrency and performance
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA synchronous = NORMAL');
      db.exec('PRAGMA cache_size = 1000');
      db.exec('PRAGMA temp_store = memory');
      
      this.ensureSQLiteSchema(db);
      this.databases.set(dbName, db);
    }
    return this.databases.get(dbName);
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Transforms flat columns to nested subscription and usage objects.
   * Projection parameter is accepted for API compatibility but not implemented.
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} query - Query object with _id or email
   * @param {string} [query._id] - User ID to search
   * @param {string} [query.email] - Email to search
   * @param {Object} [projection={}] - Field projection (compatibility only)
   * @returns {Promise<Object|null>} User object with subscription and usage nested, or null
   */
  async findUser(db, query, projection = {}) {
    const { _id, email } = query;
    let sql = "SELECT * FROM Users WHERE ";
    let params = [];
    
    if (_id) {
      sql += "_id = ?";
      params.push(_id);
    } else if (email) {
      sql += "email = ?";
      params.push(email);
    } else {
      return null;
    }

    const result = db.prepare(sql).get(...params);
    if (result) {
      // Transform subscription fields
      if (result.subscription_stripeID) {
        result.subscription = {
          stripeID: result.subscription_stripeID,
          expires: result.subscription_expires,
          status: result.subscription_status
        };
        delete result.subscription_stripeID;
        delete result.subscription_expires;
        delete result.subscription_status;
      }
      // Transform usage fields
      if (result.usage_count !== undefined) {
        result.usage = {
          count: result.usage_count || 0,
          reset_at: result.usage_reset_at || null
        };
        delete result.usage_count;
        delete result.usage_reset_at;
      }
    }
    return result;
  }

  /**
   * Insert new user with default values
   *
   * Creates user record. Subscription and usage fields are nullable/default.
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} userData - User data to insert
   * @param {string} userData._id - User ID (UUID)
   * @param {string} userData.email - User email (unique)
   * @param {string} userData.name - User name
   * @param {number} userData.created_at - Unix timestamp
   * @returns {Promise<{insertedId: string}>} Inserted user ID
   * @throws {Error} If email already exists
   */
  async insertUser(db, userData) {
    const { _id, email, name, created_at } = userData;
    const sql = "INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)";
    db.prepare(sql).run(_id, email, name, created_at);
    return { insertedId: _id };
  }

  /**
   * Update user fields by ID
   *
   * Supports three update patterns:
   * - $inc operator for atomic increments (e.g., usage.count)
   * - $set with subscription object (maps to subscription_* columns)
   * - $set with usage object (maps to usage_* columns)
   * - $set with flat fields (direct column updates)
   *
   * Whitelists allowed fields to prevent SQL injection.
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} query - Query object with _id
   * @param {string} query._id - User ID to update
   * @param {Object} update - Update object with $inc or $set
   * @param {Object} [update.$inc] - Atomic increment operations
   * @param {Object} [update.$set] - Field updates
   * @returns {Promise<{modifiedCount: number}>} Number of modified rows
   */
  async updateUser(db, query, update) {
    const { _id } = query;
    const ALLOWED_FIELDS = ['name', 'email', 'created_at', 'subscription_stripeID', 'subscription_expires', 'subscription_status', 'usage_count', 'usage_reset_at'];

    // Handle $inc operator for atomic increments
    if (update.$inc) {
      const incField = Object.keys(update.$inc)[0];
      const incValue = update.$inc[incField];
      // Map nested fields to flat column names
      const columnMap = { 'usage.count': 'usage_count' };
      const column = columnMap[incField] || incField;
      if (!ALLOWED_FIELDS.includes(column)) return { modifiedCount: 0 };
      const sql = `UPDATE Users SET ${column} = COALESCE(${column}, 0) + ? WHERE _id = ?`;
      const result = db.prepare(sql).run(incValue, _id);
      return { modifiedCount: result.changes };
    }

    const updateData = update.$set;
    if (!updateData) return { modifiedCount: 0 };

    if (updateData.subscription) {
      const { stripeID, expires, status } = updateData.subscription;
      const sql = `UPDATE Users SET
        subscription_stripeID = ?,
        subscription_expires = ?,
        subscription_status = ?
        WHERE _id = ?`;
      const result = db.prepare(sql).run(stripeID, expires, status, _id);
      return { modifiedCount: result.changes };
    } else if (updateData.usage) {
      const { count, reset_at } = updateData.usage;
      const sql = `UPDATE Users SET
        usage_count = ?,
        usage_reset_at = ?
        WHERE _id = ?`;
      const result = db.prepare(sql).run(count, reset_at, _id);
      return { modifiedCount: result.changes };
    } else {
      // Handle other updates with field validation
      const fields = Object.keys(updateData).filter(field => ALLOWED_FIELDS.includes(field));
      if (fields.length === 0) return { modifiedCount: 0 };

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateData[field]);
      values.push(_id);

      const sql = `UPDATE Users SET ${setClause} WHERE _id = ?`;
      const result = db.prepare(sql).run(...values);
      return { modifiedCount: result.changes };
    }
  }

  /**
   * Find authentication record by email
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} query - Query object with email
   * @param {string} query.email - Email to search
   * @returns {Promise<Object|null>} Auth record with password hash, or null
   */
  async findAuth(db, query) {
    const { email } = query;
    const sql = "SELECT * FROM Auths WHERE email = ?";
    return db.prepare(sql).get(email);
  }

  /**
   * Insert authentication record with hashed password
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} authData - Auth data to insert
   * @param {string} authData.email - User email (primary key)
   * @param {string} authData.password - Bcrypt hashed password
   * @param {string} authData.userID - User ID foreign key
   * @returns {Promise<{insertedId: string}>} Inserted email
   * @throws {Error} If email already exists
   */
  async insertAuth(db, authData) {
    const { email, password, userID } = authData;
    const sql = "INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)";
    db.prepare(sql).run(email, password, userID);
    return { insertedId: email };
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {string} eventId - Stripe event ID
   * @returns {Promise<Object|null>} Webhook event record or null if not found
   */
  async findWebhookEvent(db, eventId) {
    const sql = "SELECT * FROM WebhookEvents WHERE event_id = ?";
    return db.prepare(sql).get(eventId);
  }

  /**
   * Insert webhook event record for idempotency tracking
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {string} eventId - Stripe event ID (unique)
   * @param {string} eventType - Stripe event type
   * @param {number} processedAt - Unix timestamp
   * @returns {Promise<{insertedId: string}>} Inserted event ID
   */
  async insertWebhookEvent(db, eventId, eventType, processedAt) {
    const sql = "INSERT INTO WebhookEvents (event_id, event_type, processed_at) VALUES (?, ?, ?)";
    db.prepare(sql).run(eventId, eventType, processedAt);
    return { insertedId: eventId };
  }

  /**
   * Execute custom SQL query with unified response format
   *
   * Handles both SELECT (uses .all()) and modification queries (uses .run()).
   * Automatically detects query type. Supports transactions via transaction array.
   *
   * Response format includes success flag, data, rowCount, and metadata with timing.
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Object} queryObject - Query configuration
   * @param {string} [queryObject.query] - SQL query string
   * @param {Array} [queryObject.params=[]] - Query parameters for prepared statements
   * @param {Array<{query: string, params: Array}>} [queryObject.transaction] - Transaction operations
   * @returns {Promise<{success: boolean, data: any, rowCount: number, metadata: Object}>} Query result
   */
  async execute(db, queryObject) {
    const startTime = Date.now();

    try {
      const { query, params = [], transaction } = queryObject;
      if (transaction && Array.isArray(transaction)) {
        return this.executeTransaction(db, transaction, startTime);
      }
      
      if (!query) {
        throw new Error('Query string is required');
      }

      // Determine if it's a SELECT query or modification query
      const isSelect = query.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        // Use .all() for SELECT queries to get all results
        const stmt = db.prepare(query);
        const data = stmt.all(...params);
        
        return {
          success: true,
          data,
          rowCount: data.length,
          metadata: {
            executionTime: Date.now() - startTime,
            dbType: 'sqlite'
          }
        };
      } else {
        // Use .run() for INSERT, UPDATE, DELETE
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        
        let data = {};
        if (result.lastInsertRowid) {
          data.insertedId = result.lastInsertRowid;
        }
        if (result.changes !== undefined) {
          data.modifiedCount = result.changes;
          data.deletedCount = result.changes; // For DELETE queries
        }
        
        return {
          success: true,
          data,
          rowCount: result.changes || 0,
          metadata: {
            executionTime: Date.now() - startTime,
            dbType: 'sqlite'
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'sqlite'
        }
      };
    }
  }

  /**
   * Execute multiple SQL operations in a transaction
   *
   * Wraps operations in BEGIN/COMMIT with automatic ROLLBACK on error.
   * All operations succeed or all fail atomically.
   *
   * @async
   * @param {Database} db - SQLite database instance
   * @param {Array<{query: string, params: Array}>} operations - Operations to execute
   * @param {number} startTime - Transaction start timestamp for metadata
   * @returns {Promise<{success: boolean, data: Array, rowCount: number, metadata: Object}>} Transaction results
   * @throws {Error} Rolls back and throws on any operation failure
   */
  async executeTransaction(db, operations, startTime) {
    try {
      const results = [];
      db.exec('BEGIN TRANSACTION');
      
      for (const operation of operations) {
        const { query, params = [] } = operation;
        const stmt = db.prepare(query);
        const result = stmt.run(...params);
        
        results.push({
          query,
          changes: result.changes || 0,
          lastInsertRowid: result.lastInsertRowid || null
        });
      }
      
      db.exec('COMMIT');
      
      return {
        success: true,
        data: results,
        rowCount: results.reduce((sum, r) => sum + r.changes, 0),
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'sqlite'
        }
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Close all database connections and clear cache
   *
   * Call on application shutdown to properly close all SQLite databases.
   *
   * @returns {void}
   */
  closeAll() {
    for (const [dbName, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
}