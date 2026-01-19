import pg from 'pg';

/**
 * PostgreSQL database provider with connection pooling
 *
 * Manages multiple PostgreSQL connection pools with automatic SSL detection.
 * Disables SSL for localhost connections, enables for remote connections.
 *
 * Features:
 * - Connection pooling (max 20 connections)
 * - Automatic SSL detection based on hostname
 * - Parameterized queries with $1, $2 syntax
 * - Nested object transformation (subscription, usage)
 * - Transaction support with BEGIN/COMMIT/ROLLBACK
 *
 * @class
 */
export class PostgreSQLProvider {
  /**
   * Create PostgreSQL provider with empty pool cache
   */
  constructor() {
    this.pools = new Map();
  }

  /**
   * Initialize PostgreSQL provider
   *
   * No-op initialization for interface compatibility.
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    console.log('PostgreSQL provider initialized');
  }

  /**
   * Get or create PostgreSQL connection pool with caching
   *
   * Creates pg.Pool with automatic SSL detection. Disables SSL for localhost
   * (localhost, 127.0.0.1, ::1), enables for remote hosts. Pool configuration:
   * - max: 20 connections
   * - idleTimeoutMillis: 30000
   * - connectionTimeoutMillis: 2000
   *
   * @async
   * @param {string} dbName - Database name for cache key
   * @param {string} connectionString - PostgreSQL connection URL (required)
   * @returns {Promise<pg.Pool>} PostgreSQL connection pool
   * @throws {Error} If connectionString is not provided
   */
  async getDatabase(dbName, connectionString) {
    if (!this.pools.has(dbName)) {
      if (!connectionString) {
        throw new Error(`Connection string required for PostgreSQL database: ${dbName}`);
      }
      let sslEnabled = true;
      try {
        const url = new URL(connectionString);
        const host = url.hostname.toLowerCase();
        sslEnabled = !(host === 'localhost' || host === '127.0.0.1' || host === '::1');
      } catch {
        // If URL parsing fails, default to SSL enabled for safety
        sslEnabled = true;
      }

      const pool = new pg.Pool({
        connectionString,
        ssl: sslEnabled,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      this.pools.set(dbName, pool);
      await this.ensurePostgreSQLSchema(pool);
    }
    return this.pools.get(dbName);
  }

  /**
   * Create database schema if tables don't exist
   *
   * Creates users and auths tables (lowercase names) with indexes.
   * Flattens nested subscription and usage objects into columns.
   * Uses quoted identifiers for camelCase columns (subscription_stripeID, userID).
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @returns {Promise<void>}
   */
  async ensurePostgreSQLSchema(pool) {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          _id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          "subscription_stripeID" TEXT,
          subscription_expires BIGINT,
          subscription_status TEXT,
          usage_count INTEGER DEFAULT 0,
          usage_reset_at BIGINT
        )
      `);

      // Create Auths table
      await client.query(`
        CREATE TABLE IF NOT EXISTS auths (
          email TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          "userID" TEXT NOT NULL,
          FOREIGN KEY ("userID") REFERENCES users(_id)
        )
      `);

      // Create indexes
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON auths(email)`);

    } finally {
      client.release();
    }
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Transforms flat columns to nested subscription and usage objects.
   * Uses parameterized query ($1) to prevent SQL injection.
   * Projection parameter is accepted for API compatibility but not implemented.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} query - Query object with _id or email
   * @param {string} [query._id] - User ID to search
   * @param {string} [query.email] - Email to search
   * @param {Object} [projection={}] - Field projection (compatibility only)
   * @returns {Promise<Object|null>} User object with subscription and usage nested, or null
   */
  async findUser(pool, query, projection = {}) {
    const { _id, email } = query;
    let sql = "SELECT * FROM users WHERE ";
    let params = [];

    if (_id) {
      sql += "_id = $1";
      params.push(_id);
    } else if (email) {
      sql += "email = $1";
      params.push(email);
    } else {
      return null;
    }

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      if (result.rows.length === 0) return null;

      const user = result.rows[0];
      // Transform subscription fields
      if (user.subscription_stripeID) {
        user.subscription = {
          stripeID: user.subscription_stripeID,
          expires: user.subscription_expires,
          status: user.subscription_status
        };
        delete user.subscription_stripeID;
        delete user.subscription_expires;
        delete user.subscription_status;
      }
      // Transform usage fields
      if (user.usage_count !== undefined) {
        user.usage = {
          count: user.usage_count || 0,
          reset_at: user.usage_reset_at || null
        };
        delete user.usage_count;
        delete user.usage_reset_at;
      }
      return user;
    } finally {
      client.release();
    }
  }

  /**
   * Insert new user with default values
   *
   * Creates user record with parameterized query. Subscription and usage
   * fields are nullable/default.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} userData - User data to insert
   * @param {string} userData._id - User ID (UUID)
   * @param {string} userData.email - User email (unique)
   * @param {string} userData.name - User name
   * @param {number} userData.created_at - Unix timestamp
   * @returns {Promise<{insertedId: string}>} Inserted user ID
   * @throws {Error} If email already exists
   */
  async insertUser(pool, userData) {
    const { _id, email, name, created_at } = userData;
    const sql = "INSERT INTO users (_id, email, name, created_at) VALUES ($1, $2, $3, $4)";
    
    const client = await pool.connect();
    try {
      await client.query(sql, [_id, email, name, created_at]);
      return { insertedId: _id };
    } finally {
      client.release();
    }
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
   * Uses parameterized queries ($1, $2, ...) and whitelists allowed fields.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} query - Query object with _id
   * @param {string} query._id - User ID to update
   * @param {Object} update - Update object with $inc or $set
   * @param {Object} [update.$inc] - Atomic increment operations
   * @param {Object} [update.$set] - Field updates
   * @returns {Promise<{modifiedCount: number}>} Number of modified rows
   */
  async updateUser(pool, query, update) {
    const { _id } = query;
    const ALLOWED_FIELDS = ['name', 'email', 'created_at', 'subscription_stripeID', 'subscription_expires', 'subscription_status', 'usage_count', 'usage_reset_at'];

    const client = await pool.connect();
    try {
      // Handle $inc operator for atomic increments
      if (update.$inc) {
        const incField = Object.keys(update.$inc)[0];
        const incValue = update.$inc[incField];
        // Map nested fields to flat column names
        const columnMap = { 'usage.count': 'usage_count' };
        const column = columnMap[incField] || incField;
        if (!ALLOWED_FIELDS.includes(column)) return { modifiedCount: 0 };
        const sql = `UPDATE users SET ${column} = COALESCE(${column}, 0) + $1 WHERE _id = $2`;
        const result = await client.query(sql, [incValue, _id]);
        return { modifiedCount: result.rowCount };
      }

      const updateData = update.$set;
      if (!updateData) return { modifiedCount: 0 };

      if (updateData.subscription) {
        const { stripeID, expires, status } = updateData.subscription;
        const sql = `UPDATE users SET
          "subscription_stripeID" = $1,
          subscription_expires = $2,
          subscription_status = $3
          WHERE _id = $4`;
        const result = await client.query(sql, [stripeID, expires, status, _id]);
        return { modifiedCount: result.rowCount };
      } else if (updateData.usage) {
        const { count, reset_at } = updateData.usage;
        const sql = `UPDATE users SET
          usage_count = $1,
          usage_reset_at = $2
          WHERE _id = $3`;
        const result = await client.query(sql, [count, reset_at, _id]);
        return { modifiedCount: result.rowCount };
      } else {
        // Handle other updates with field validation
        const fields = Object.keys(updateData).filter(field => ALLOWED_FIELDS.includes(field));
        if (fields.length === 0) return { modifiedCount: 0 };

        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const values = fields.map(field => updateData[field]);
        values.push(_id);

        const sql = `UPDATE users SET ${setClause} WHERE _id = $${values.length}`;
        const result = await client.query(sql, values);
        return { modifiedCount: result.rowCount };
      }
    } finally {
      client.release();
    }
  }

  /**
   * Find authentication record by email
   *
   * Uses parameterized query to prevent SQL injection.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} query - Query object with email
   * @param {string} query.email - Email to search
   * @returns {Promise<Object|null>} Auth record with password hash, or null
   */
  async findAuth(pool, query) {
    const { email } = query;
    const sql = "SELECT * FROM auths WHERE email = $1";
    
    const client = await pool.connect();
    try {
      const result = await client.query(sql, [email]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Insert authentication record with hashed password
   *
   * Uses parameterized query and quoted identifier for userID.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} authData - Auth data to insert
   * @param {string} authData.email - User email (primary key)
   * @param {string} authData.password - Bcrypt hashed password
   * @param {string} authData.userID - User ID foreign key
   * @returns {Promise<{insertedId: string}>} Inserted email
   * @throws {Error} If email already exists
   */
  async insertAuth(pool, authData) {
    const { email, password, userID } = authData;
    const sql = 'INSERT INTO auths (email, password, "userID") VALUES ($1, $2, $3)';
    
    const client = await pool.connect();
    try {
      await client.query(sql, [email, password, userID]);
      return { insertedId: email };
    } finally {
      client.release();
    }
  }

  /**
   * Execute custom SQL query with unified response format
   *
   * Handles both SELECT and modification queries using result.rows detection.
   * Supports transactions via transaction array. Uses parameterized queries.
   *
   * Response format includes success flag, data, rowCount, and metadata with timing.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Object} queryObject - Query configuration
   * @param {string} [queryObject.query] - SQL query string
   * @param {Array} [queryObject.params=[]] - Query parameters for prepared statements
   * @param {Array<{query: string, params: Array}>} [queryObject.transaction] - Transaction operations
   * @returns {Promise<{success: boolean, data: any, rowCount: number, metadata: Object}>} Query result
   */
  async execute(pool, queryObject) {
    const startTime = Date.now();

    try {
      const { query, params = [], transaction } = queryObject;
      if (transaction && Array.isArray(transaction)) {
        return this.executeTransaction(pool, transaction, startTime);
      }
      
      if (!query) {
        throw new Error('Query string is required');
      }

      const client = await pool.connect();
      try {
        const result = await client.query(query, params);
        
        // Determine if it's a SELECT query based on the result
        const isSelect = result.rows !== undefined;
        
        if (isSelect) {
          return {
            success: true,
            data: result.rows,
            rowCount: result.rows.length,
            metadata: {
              executionTime: Date.now() - startTime,
              dbType: 'postgresql'
            }
          };
        } else {
          // For INSERT, UPDATE, DELETE
          let data = {};
          if (result.rowCount !== undefined) {
            data.modifiedCount = result.rowCount;
            data.deletedCount = result.rowCount; // For DELETE queries
          }
          
          return {
            success: true,
            data,
            rowCount: result.rowCount || 0,
            metadata: {
              executionTime: Date.now() - startTime,
              dbType: 'postgresql'
            }
          };
        }
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'postgresql'
        }
      };
    }
  }

  /**
   * Execute multiple SQL operations in a transaction
   *
   * Wraps operations in BEGIN/COMMIT with automatic ROLLBACK on error.
   * All operations succeed or all fail atomically. Ensures client release.
   *
   * @async
   * @param {pg.Pool} pool - PostgreSQL connection pool
   * @param {Array<{query: string, params: Array}>} operations - Operations to execute
   * @param {number} startTime - Transaction start timestamp for metadata
   * @returns {Promise<{success: boolean, data: Array, rowCount: number, metadata: Object}>} Transaction results
   * @throws {Error} Rolls back and throws on any operation failure
   */
  async executeTransaction(pool, operations, startTime) {
    const client = await pool.connect();

    try {
      const results = [];
      await client.query('BEGIN');
      
      for (const operation of operations) {
        const { query, params = [] } = operation;
        const result = await client.query(query, params);
        
        results.push({
          query,
          rowCount: result.rowCount || 0,
          rows: result.rows || []
        });
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        data: results,
        rowCount: results.reduce((sum, r) => sum + r.rowCount, 0),
        metadata: {
          executionTime: Date.now() - startTime,
          dbType: 'postgresql'
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close all connection pools and clear cache
   *
   * Ends all PostgreSQL pools gracefully. Call on application shutdown.
   *
   * @async
   * @returns {Promise<void>}
   */
  async closeAll() {
    for (const [dbName, pool] of this.pools) {
      await pool.end();
    }
    this.pools.clear();
  }
}