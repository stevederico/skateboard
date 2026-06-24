import type {
  DatabaseProvider,
  DeleteResult,
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

// ==== LOCAL DRIVER SURFACE ====
//
// `pg` is an optional dependency: it is not installed in this repo, and apps
// that configure PostgreSQL install it themselves. The driver surface this
// adapter actually touches is typed locally, and the module is loaded lazily
// through a variable specifier so tsc never tries to resolve 'pg'.

/**
 * Result surface of a pg query. `command` is the SQL command tag ('SELECT',
 * 'UPDATE', ...); `rowCount` is null for commands that affect no rows (DDL).
 */
interface QueryResultLike<R = Record<string, unknown>> {
  rows: R[];
  rowCount: number | null;
  command: string;
}

/** A client checked out of the pool; must be released back. */
interface PoolClientLike {
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResultLike<R>>;
  release(): void;
}

/** Pool options this adapter passes to the Pool constructor. */
interface PoolConfigLike {
  connectionString?: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/** Connection pool surface used by this adapter. */
export interface PoolLike {
  connect(): Promise<PoolClientLike>;
  query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResultLike<R>>;
  end(): Promise<void>;
}

/** The pg module surface used by this adapter. */
interface PgModule {
  /** Pool constructor — the only connection entry point used. */
  Pool: new (config?: PoolConfigLike) => PoolLike;
  /** Driver-global type-parser registry. */
  types: { setTypeParser(oid: number, parser: (value: string) => unknown): void };
}

/**
 * Narrow an unknown dynamic-import result to the pg module surface this
 * adapter touches. Verifies the members actually used (the Pool constructor
 * and the types.setTypeParser registry) are present and callable.
 *
 * @param value - Candidate module namespace
 * @returns True if value matches the PgModule surface
 */
function isPgModule(value: unknown): value is PgModule {
  if (typeof value !== 'object' || value === null) return false;
  if (!('Pool' in value) || typeof value.Pool !== 'function') return false;
  if (!('types' in value)) return false;
  const { types } = value;
  if (typeof types !== 'object' || types === null) return false;
  return 'setTypeParser' in types && typeof types.setTypeParser === 'function';
}

/** PostgreSQL OID for the int8 (BIGINT) type. */
const INT8_OID = 20;

// Variable specifier keeps tsc from resolving the optional module.
const PG_SPECIFIER = 'pg';

/**
 * Live driver-import seam. Production loads the real optional `pg` module via a
 * variable-specifier dynamic import; tests swap it through {@link __setPgModuleLoaderForTests}.
 *
 * @returns The raw `pg` module namespace (validated downstream by isPgModule)
 */
let loadPgModule: () => Promise<unknown> = () => import(PG_SPECIFIER);

/**
 * Test-only seam: replace the `pg` module loader. Avoids `mock.module('pg')`,
 * whose mocked dynamic import no longer applies under Node 24.14, leaving
 * assertPgModule to reject the real (unmocked) surface.
 *
 * @param loader - Replacement loader returning the pg module namespace
 */
export function __setPgModuleLoaderForTests(loader: () => Promise<unknown>): void {
  loadPgModule = loader;
}

/** Cached driver module, loaded once by loadPgDriver(). */
let pgDriver: PgModule | null = null;

/**
 * Load and cache the optional `pg` driver.
 *
 * On first load, registers an int8 (BIGINT) type parser so BIGINT columns
 * (created_at, subscription_expires, ...) come back as numbers instead of the
 * driver's default strings, keeping the numeric contract in types.ts true.
 *
 * @returns The pg module surface
 * @throws {Error} If the `pg` package is not installed
 */
async function loadPgDriver(): Promise<PgModule> {
  if (!pgDriver) {
    // pg is CommonJS: the namespace's `default` carries module.exports.
    const namespace: unknown = await loadPgModule();
    const exported =
      typeof namespace === 'object' && namespace !== null && 'default' in namespace
        ? namespace.default
        : undefined;
    const candidate = exported ?? namespace;
    if (!isPgModule(candidate)) {
      throw new Error("The 'pg' package did not export the expected module surface (Pool, types.setTypeParser)");
    }
    candidate.types.setTypeParser(INT8_OID, (value) => parseInt(value, 10));
    pgDriver = candidate;
  }
  return pgDriver;
}

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
 * - Lazy load of the optional `pg` driver (not a declared dependency)
 * - BIGINT (int8) columns parsed to numbers via a driver type parser
 * - Connection pooling (max 20 connections)
 * - Automatic SSL detection based on hostname
 * - Parameterized queries with $1, $2 syntax
 * - Nested object transformation (subscription, usage)
 * - Transaction support with BEGIN/COMMIT/ROLLBACK
 *
 * @class
 */
export class PostgreSQLProvider implements DatabaseProvider<PoolLike> {
  /** Cached connection pools keyed by database name. */
  declare pools: Map<string, PoolLike>;

  /**
   * Create PostgreSQL provider with empty pool cache
   */
  constructor() {
    this.pools = new Map();
  }

  /**
   * Initialize PostgreSQL provider
   *
   * Loads and caches the optional `pg` driver (registering its BIGINT
   * parser). The manager awaits this right after constructing the provider,
   * so the driver still loads during adapter initialization.
   *
   * @async
   * @throws {Error} If the `pg` package is not installed
   */
  async initialize(): Promise<void> {
    await loadPgDriver();
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
  async getDatabase(dbName: string, connectionString?: string | null): Promise<PoolLike> {
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

      const pg = await loadPgDriver();
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
  async ensurePostgreSQLSchema(pool: PoolLike): Promise<void> {
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
  async findUser(pool: PoolLike, query: UserQuery, projection: Record<string, unknown> = {}): Promise<User | null> {
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
          // BIGINT comes back numeric thanks to the int8 parser in loadPgDriver
          expires: user.subscription_expires ?? null,
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
  async insertUser(pool: PoolLike, userData: User): Promise<InsertResult> {
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
  async updateUser(pool: PoolLike, query: UserQuery, update: UserUpdate): Promise<UpdateResult> {
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
        return { modifiedCount: result.rowCount ?? 0 };
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
        return { modifiedCount: result.rowCount ?? 0 };
      } else if (updateData.usage) {
        const { count, reset_at } = updateData.usage;
        const sql = `UPDATE users SET
          usage_count = $1,
          usage_reset_at = $2
          WHERE _id = $3`;
        const result = await client.query(sql, [count, reset_at, _id]);
        return { modifiedCount: result.rowCount ?? 0 };
      } else {
        // Handle other updates with field validation
        const fields = Object.keys(updateData).filter(field => ALLOWED_FIELDS.includes(field));
        if (fields.length === 0) return { modifiedCount: 0 };

        const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        const values: unknown[] = fields.map(field => updateData[field]);
        values.push(_id);

        const sql = `UPDATE users SET ${setClause} WHERE _id = $${values.length}`;
        const result = await client.query(sql, values);
        return { modifiedCount: result.rowCount ?? 0 };
      }
    } finally {
      client.release();
    }
  }

  /**
   * Delete user row by ID or email
   *
   * Matches findUser's selector convention: _id is checked first, then email.
   * Returns deletedCount 0 when neither selector is given or no row matches.
   *
   * @async
   * @param pool - PostgreSQL connection pool
   * @param query - Query object with _id or email
   * @returns Number of deleted rows
   */
  async deleteUser(pool: PoolLike, query: UserQuery): Promise<DeleteResult> {
    const { _id, email } = query;
    let sql = "DELETE FROM users WHERE ";
    const params: SqlParam[] = [];

    if (_id) {
      sql += "_id = $1";
      params.push(_id);
    } else if (email) {
      sql += "email = $1";
      params.push(email);
    } else {
      return { deletedCount: 0 };
    }

    const client = await pool.connect();
    try {
      const result = await client.query(sql, params);
      return { deletedCount: result.rowCount ?? 0 };
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
  async findAuth(pool: PoolLike, query: AuthQuery): Promise<AuthRecord | null> {
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
  async insertAuth(pool: PoolLike, authData: AuthRecord): Promise<InsertResult> {
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
  async updateAuth(pool: PoolLike, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult> {
    const { email } = query;
    const { password } = update;
    if (typeof password !== 'string') return { modifiedCount: 0 };
    const sql = "UPDATE auths SET password = $1 WHERE email = $2";

    const client = await pool.connect();
    try {
      const result = await client.query(sql, [password, email]);
      return { modifiedCount: result.rowCount ?? 0 };
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
  async findWebhookEvent(pool: PoolLike, eventId: string): Promise<WebhookEventRecord | null> {
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
  async insertWebhookEvent(pool: PoolLike, eventId: string, eventType: string, processedAt: number): Promise<InsertResult> {
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
   * Distinguishes reads from writes via the result's command tag: 'SELECT'
   * returns rows; anything else (INSERT/UPDATE/DELETE/DDL) returns the
   * write-shaped counts. Supports transactions via transaction array.
   * Uses parameterized queries.
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
  async execute(pool: PoolLike, queryObject: QueryObject): Promise<ExecuteResult> {
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

        // The command tag tells reads from writes (pg always populates rows,
        // even for writes, so rows-presence cannot distinguish them)
        const isSelect = result.command === 'SELECT';

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
          // For INSERT, UPDATE, DELETE (rowCount is null for row-less commands)
          const affectedRows = result.rowCount ?? 0;
          const data = {
            modifiedCount: affectedRows,
            deletedCount: affectedRows // For DELETE queries
          };

          return {
            success: true,
            data,
            rowCount: affectedRows,
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
        error: error instanceof Error ? error.message : String(error),
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
  async executeTransaction(pool: PoolLike, operations: SqlStatement[], startTime: number): Promise<ExecuteSuccess> {
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
      try {
        await client.query('ROLLBACK');
      } catch {
        // Rollback failures should not mask the original transaction error
      }
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
