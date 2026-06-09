import pg from 'pg';
import type { Pool } from 'pg';
import type {
  DatabaseProvider,
  User,
  UserQuery,
  UserUpdate,
  AuthRecord,
  AuthQuery,
  AuthUpdate,
  WebhookEventRecord,
  InsertResult,
  UpdateResult,
  QueryObject,
  SqlQueryObject,
  SqlStatement,
  SqlParam,
  ExecuteResult,
  ExecuteSuccess,
} from '../types.ts';

/**
 * Flat `users` row as returned by SELECT * before findUser rebuilds the
 * nested subscription/usage objects. Columns are optional so the in-place
 * transform can `delete` them after nesting.
 */
interface UserRow extends User {
  subscription_stripeID?: string | null;
  subscription_expires?: number | null;
  subscription_status?: string | null;
  usage_count?: number | null;
  usage_reset_at?: number | null;
}

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
export class PostgreSQLProvider implements DatabaseProvider<Pool> {
  /** Cached connection pools keyed by database name. */
  declare pools: Map<string, Pool>;

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
   */
  async initialize(): Promise<void> {
    // Provider ready for connections
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
   * @param dbName - Database name for cache key
   * @param connectionString - PostgreSQL connection URL (required)
   * @returns PostgreSQL connection pool
   * @throws If connectionString is not provided
   */
  async getDatabase(dbName: string, connectionString?: string | null): Promise<Pool> {
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
    return this.pools.get(dbName)!;
  }

  /**
   * Create database schema if tables don't exist
   *
   * Creates users and auths tables (lowercase names) with indexes.
   * Flattens nested subscription and usage objects into columns.
   * Uses quoted identifiers for camelCase columns (subscription_stripeID, userID).
   *
   * @async
   * @param pool - PostgreSQL connection pool
   */
  async ensurePostgreSQLSchema(pool: Pool): Promise<void> {
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

      // Create webhook_events table for idempotency
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          processed_at BIGINT NOT NULL
        )
      `);

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
   * @param pool - PostgreSQL connection pool
   * @param query - Query object with _id or email
   * @param query._id - User ID to search
   * @param query.email - Email to search
   * @param projection - Field projection (compatibility only)
   * @returns User object with subscription and usage nested, or null
   */
  async findUser(pool: Pool, query: UserQuery, projection: Record<string, unknown> = {}): Promise<User | null> {
    const { _id, email } = query;
    let sql = "SELECT * FROM users WHERE ";
    let params: SqlParam[] = [];

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
      const result = await client.query<UserRow>(sql, params);
      if (result.rows.length === 0) return null;

      const user = result.rows[0];
      // Transform subscription fields
      if (user.subscription_stripeID) {
        user.subscription = {
          stripeID: user.subscription_stripeID,
          expires: user.subscription_expires as number | null,
          status: user.subscription_status as string
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
   * @param pool - PostgreSQL connection pool
   * @param userData - User data to insert
   * @param userData._id - User ID (UUID)
   * @param userData.email - User email (unique)
   * @param userData.name - User name
   * @param userData.created_at - Unix timestamp
   * @returns Inserted user ID
   * @throws If email already exists
   */
  async insertUser(pool: Pool, userData: User): Promise<InsertResult> {
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
   * @param pool - PostgreSQL connection pool
   * @param query - Query object with _id
   * @param query._id - User ID to update
   * @param update - Update object with $inc or $set
   * @param update.$inc - Atomic increment operations
   * @param update.$set - Field updates
   * @returns Number of modified rows
   */
  async updateUser(pool: Pool, query: UserQuery, update: UserUpdate): Promise<UpdateResult> {
    const { _id } = query;
    const ALLOWED_FIELDS = ['name', 'email', 'created_at', 'subscription_stripeID', 'subscription_expires', 'subscription_status', 'usage_count', 'usage_reset_at'];

    const client = await pool.connect();
    try {
      // Handle $inc operator for atomic increments
      if (update.$inc) {
        const incField = Object.keys(update.$inc)[0];
        const incValue = update.$inc[incField];
        // Map nested fields to flat column names
        const columnMap: Record<string, string> = { 'usage.count': 'usage_count' };
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
        const values: unknown[] = fields.map(field => updateData[field]);
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
   * @param pool - PostgreSQL connection pool
   * @param query - Query object with email
   * @param query.email - Email to search
   * @returns Auth record with password hash, or null
   */
  async findAuth(pool: Pool, query: AuthQuery): Promise<AuthRecord | null> {
    const { email } = query;
    const sql = "SELECT * FROM auths WHERE email = $1";

    const client = await pool.connect();
    try {
      const result = await client.query<AuthRecord>(sql, [email]);
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
   * @param pool - PostgreSQL connection pool
   * @param authData - Auth data to insert
   * @param authData.email - User email (primary key)
   * @param authData.password - Bcrypt hashed password
   * @param authData.userID - User ID foreign key
   * @returns Inserted email
   * @throws If email already exists
   */
  async insertAuth(pool: Pool, authData: AuthRecord): Promise<InsertResult> {
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
   * Update authentication record (password only)
   *
   * @async
   * @param pool - PostgreSQL connection pool
   * @param query - Query object with email
   * @param query.email - Email of auth record to update
   * @param update - Fields to update
   * @param update.password - New password hash
   * @returns Number of modified rows
   */
  async updateAuth(pool: Pool, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult> {
    const { email } = query;
    const { password } = update;
    if (typeof password !== 'string') return { modifiedCount: 0 };
    const sql = "UPDATE auths SET password = $1 WHERE email = $2";

    const client = await pool.connect();
    try {
      const result = await client.query(sql, [password, email]);
      return { modifiedCount: result.rowCount };
    } finally {
      client.release();
    }
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * @async
   * @param pool - PostgreSQL connection pool
   * @param eventId - Stripe event ID
   * @returns Webhook event record or null if not found
   */
  async findWebhookEvent(pool: Pool, eventId: string): Promise<WebhookEventRecord | null> {
    const sql = "SELECT * FROM webhook_events WHERE event_id = $1";
    const client = await pool.connect();
    try {
      const result = await client.query<WebhookEventRecord>(sql, [eventId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  /**
   * Insert webhook event record for idempotency tracking
   *
   * @async
   * @param pool - PostgreSQL connection pool
   * @param eventId - Stripe event ID (unique)
   * @param eventType - Stripe event type
   * @param processedAt - Unix timestamp
   * @returns Inserted event ID
   */
  async insertWebhookEvent(pool: Pool, eventId: string, eventType: string, processedAt: number): Promise<InsertResult> {
    const sql = "INSERT INTO webhook_events (event_id, event_type, processed_at) VALUES ($1, $2, $3)";
    const client = await pool.connect();
    try {
      await client.query(sql, [eventId, eventType, processedAt]);
      return { insertedId: eventId };
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
   * @param pool - PostgreSQL connection pool
   * @param queryObject - Query configuration
   * @param queryObject.query - SQL query string
   * @param queryObject.params - Query parameters for prepared statements
   * @param queryObject.transaction - Transaction operations
   * @returns Query result
   */
  async execute(pool: Pool, queryObject: QueryObject): Promise<ExecuteResult> {
    const startTime = Date.now();

    try {
      const { query, params = [], transaction } = queryObject as SqlQueryObject;
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
          let data: { modifiedCount?: number; deletedCount?: number } = {};
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
        error: (error as Error).message,
        code: (error as { code?: string | number }).code,
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
   * @param pool - PostgreSQL connection pool
   * @param operations - Operations to execute
   * @param startTime - Transaction start timestamp for metadata
   * @returns Transaction results
   * @throws Rolls back and throws on any operation failure
   */
  async executeTransaction(pool: Pool, operations: SqlStatement[], startTime: number): Promise<ExecuteSuccess> {
    const client = await pool.connect();

    try {
      const results: { query: string; rowCount: number; rows: Record<string, unknown>[] }[] = [];
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
   */
  async closeAll(): Promise<void> {
    for (const [dbName, pool] of this.pools) {
      await pool.end();
    }
    this.pools.clear();
  }
}
