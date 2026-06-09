import { DatabaseSync as Database } from "node:sqlite";
import { mkdir } from 'node:fs';
import { promisify } from 'node:util';
import type {
  AuthQuery,
  AuthRecord,
  AuthUpdate,
  DatabaseProvider,
  DeleteResult,
  ExecuteResult,
  InsertResult,
  SqlParam,
  SqlQueryObject,
  SqlStatement,
  Subscription,
  UpdateResult,
  Usage,
  User,
  UserQuery,
  UserUpdate,
  WebhookEventRecord
} from '../types.ts';

/**
 * Raw Users table row as returned by SELECT *, with flat subscription_* and
 * usage_* columns. findUser mutates this shape in place — nesting the flat
 * columns into `subscription`/`usage` objects and deleting them — so the flat
 * columns are optional and the nested fields are declared here too.
 */
type UserRow = {
  _id: string;
  email: string;
  name: string;
  created_at: number;
  subscription_stripeID?: string | null;
  subscription_expires?: number | null;
  subscription_status?: string | null;
  usage_count?: number | null;
  usage_reset_at?: number | null;
  subscription?: Subscription;
  usage?: Usage;
};

/**
 * Per-statement result row collected by executeTransaction.
 */
type TransactionStatementResult = {
  query: string;
  changes: number;
  lastInsertRowid: number | bigint | null;
};

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
export class SQLiteProvider implements DatabaseProvider<Database> {
  databases: Map<string, Database>;

  /**
   * Create SQLite provider with empty database cache
   */
  constructor() {
    this.databases = new Map();
  }

  /**
   * Initialize SQLite provider by creating databases directory
   */
  async initialize(): Promise<void> {
    await this.initializeSQLite();
  }

  /**
   * Create ./databases directory if it doesn't exist
   *
   * Uses recursive option to create parent directories. Ignores EEXIST errors.
   */
  async initializeSQLite(): Promise<void> {
    try {
      await promisify(mkdir)('./databases', { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
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
   * @param db - SQLite database instance
   */
  async ensureSQLiteSchema(db: Database): Promise<void> {
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
   * @param dbName - Database name for cache key
   * @param connectionString - File path, defaults to ./databases/{dbName}.db
   * @returns SQLite DatabaseSync instance
   */
  getDatabase(dbName: string, connectionString: string | null = null): Database {
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
    return this.databases.get(dbName)!;
  }

  /**
   * Find user by ID or email with optional field projection
   *
   * Transforms flat columns to nested subscription and usage objects.
   * Projection parameter is accepted for API compatibility but not implemented.
   *
   * @param db - SQLite database instance
   * @param query - Query object with _id or email
   * @param projection - Field projection (compatibility only)
   * @returns User object with subscription and usage nested, or null
   */
  async findUser(db: Database, query: UserQuery, projection: Record<string, unknown> = {}): Promise<User | null> {
    const { _id, email } = query;
    let sql = "SELECT * FROM Users WHERE ";
    let params: SqlParam[] = [];

    if (_id) {
      sql += "_id = ?";
      params.push(_id);
    } else if (email) {
      sql += "email = ?";
      params.push(email);
    } else {
      return null;
    }

    // node:sqlite returns undefined for a miss; normalize to the declared null
    const result = (db.prepare(sql).get(...params) as unknown as UserRow | undefined) ?? null;
    if (result) {
      // Transform subscription fields
      if (result.subscription_stripeID) {
        result.subscription = {
          stripeID: result.subscription_stripeID,
          expires: result.subscription_expires!,
          status: result.subscription_status!
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
   * @param db - SQLite database instance
   * @param userData - User data to insert
   * @returns Inserted user ID
   * @throws {Error} If email already exists
   */
  async insertUser(db: Database, userData: User): Promise<InsertResult> {
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
   * @param db - SQLite database instance
   * @param query - Query object with _id
   * @param update - Update object with $inc or $set
   * @returns Number of modified rows
   */
  async updateUser(db: Database, query: UserQuery, update: UserUpdate): Promise<UpdateResult> {
    const { _id } = query;
    const ALLOWED_FIELDS = ['name', 'email', 'created_at', 'subscription_stripeID', 'subscription_expires', 'subscription_status', 'usage_count', 'usage_reset_at'];

    // Handle $inc operator for atomic increments
    if (update.$inc) {
      const incField = Object.keys(update.$inc)[0];
      const incValue = update.$inc[incField];
      // Map nested fields to flat column names
      const columnMap: Record<string, string> = { 'usage.count': 'usage_count' };
      const column = columnMap[incField] || incField;
      if (!ALLOWED_FIELDS.includes(column)) return { modifiedCount: 0 };
      const sql = `UPDATE Users SET ${column} = COALESCE(${column}, 0) + ? WHERE _id = ?`;
      const result = db.prepare(sql).run(incValue, _id!);
      return { modifiedCount: result.changes as number };
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
      const result = db.prepare(sql).run(stripeID, expires, status, _id!);
      return { modifiedCount: result.changes as number };
    } else if (updateData.usage) {
      const { count, reset_at } = updateData.usage;
      const sql = `UPDATE Users SET
        usage_count = ?,
        usage_reset_at = ?
        WHERE _id = ?`;
      const result = db.prepare(sql).run(count, reset_at, _id!);
      return { modifiedCount: result.changes as number };
    } else {
      // Handle other updates with field validation
      const fields = Object.keys(updateData).filter(field => ALLOWED_FIELDS.includes(field));
      if (fields.length === 0) return { modifiedCount: 0 };

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateData[field]) as SqlParam[];
      values.push(_id!);

      const sql = `UPDATE Users SET ${setClause} WHERE _id = ?`;
      const result = db.prepare(sql).run(...values);
      return { modifiedCount: result.changes as number };
    }
  }

  /**
   * Delete user row by ID or email
   *
   * Matches findUser's selector convention: _id is checked first, then email.
   * Returns deletedCount 0 when neither selector is given or no row matches.
   *
   * @param db - SQLite database instance
   * @param query - Query object with _id or email
   * @returns Number of deleted rows
   */
  async deleteUser(db: Database, query: UserQuery): Promise<DeleteResult> {
    const { _id, email } = query;
    let sql = "DELETE FROM Users WHERE ";
    const params: SqlParam[] = [];

    if (_id) {
      sql += "_id = ?";
      params.push(_id);
    } else if (email) {
      sql += "email = ?";
      params.push(email);
    } else {
      return { deletedCount: 0 };
    }

    const result = db.prepare(sql).run(...params);
    return { deletedCount: result.changes as number };
  }

  /**
   * Find authentication record by email
   *
   * @param db - SQLite database instance
   * @param query - Query object with email
   * @returns Auth record with password hash, or null
   */
  async findAuth(db: Database, query: AuthQuery): Promise<AuthRecord | null> {
    const { email } = query;
    const sql = "SELECT * FROM Auths WHERE email = ?";
    // node:sqlite returns undefined for a miss; normalize to the declared null
    return (db.prepare(sql).get(email) as unknown as AuthRecord | undefined) ?? null;
  }

  /**
   * Insert authentication record with hashed password
   *
   * @param db - SQLite database instance
   * @param authData - Auth data to insert
   * @returns Inserted email
   * @throws {Error} If email already exists
   */
  async insertAuth(db: Database, authData: AuthRecord): Promise<InsertResult> {
    const { email, password, userID } = authData;
    const sql = "INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)";
    db.prepare(sql).run(email, password, userID);
    return { insertedId: email };
  }

  /**
   * Update authentication record (password only)
   *
   * @param db - SQLite database instance
   * @param query - Query object with email
   * @param update - Fields to update
   * @returns Number of modified rows
   */
  async updateAuth(db: Database, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult> {
    const { email } = query;
    const { password } = update;
    if (typeof password !== 'string') return { modifiedCount: 0 };
    const sql = "UPDATE Auths SET password = ? WHERE email = ?";
    const result = db.prepare(sql).run(password, email);
    return { modifiedCount: result.changes as number };
  }

  /**
   * Find webhook event by event ID for idempotency check
   *
   * @param db - SQLite database instance
   * @param eventId - Stripe event ID
   * @returns Webhook event record or null if not found
   */
  async findWebhookEvent(db: Database, eventId: string): Promise<WebhookEventRecord | null> {
    const sql = "SELECT * FROM WebhookEvents WHERE event_id = ?";
    // node:sqlite returns undefined for a miss; normalize to the declared null
    return (db.prepare(sql).get(eventId) as unknown as WebhookEventRecord | undefined) ?? null;
  }

  /**
   * Insert webhook event record for idempotency tracking
   *
   * @param db - SQLite database instance
   * @param eventId - Stripe event ID (unique)
   * @param eventType - Stripe event type
   * @param processedAt - Unix timestamp
   * @returns Inserted event ID
   */
  async insertWebhookEvent(db: Database, eventId: string, eventType: string, processedAt: number): Promise<InsertResult> {
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
   * @param db - SQLite database instance
   * @param queryObject - Query configuration with query string, params, or transaction operations
   * @returns Query result
   */
  async execute(db: Database, queryObject: SqlQueryObject): Promise<ExecuteResult> {
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

        let data: { insertedId?: number | bigint; modifiedCount?: number | bigint; deletedCount?: number | bigint } = {};
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
          rowCount: (result.changes as number) || 0,
          metadata: {
            executionTime: Date.now() - startTime,
            dbType: 'sqlite'
          }
        };
      }
    } catch (error) {
      const err = error as Error & { code?: string | number };
      return {
        success: false,
        error: err.message,
        code: err.code,
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
   * @param db - SQLite database instance
   * @param operations - Operations to execute
   * @param startTime - Transaction start timestamp for metadata
   * @returns Transaction results
   * @throws {Error} Rolls back and throws on any operation failure
   */
  async executeTransaction(db: Database, operations: SqlStatement[], startTime: number): Promise<ExecuteResult> {
    try {
      const results: TransactionStatementResult[] = [];
      db.exec('BEGIN TRANSACTION');

      for (const operation of operations) {
        const { query, params = [] } = operation;
        const stmt = db.prepare(query);
        const result = stmt.run(...params);

        results.push({
          query,
          changes: (result.changes as number) || 0,
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
   */
  closeAll(): void {
    for (const [dbName, db] of this.databases) {
      db.close();
    }
    this.databases.clear();
  }
}
