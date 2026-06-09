/**
 * Shared backend type definitions for the Skateboard server and database adapters.
 *
 * Pure types only — interfaces, type aliases, and string-literal unions — so the
 * file is fully erasable (`erasableSyntaxOnly`) and safe under Node 24
 * type-stripping. Import with:
 *
 *   import type { DatabaseProvider, User } from './types.ts';
 */

// ==== DATABASE IDENTIFIERS ====

/**
 * Database type identifiers accepted by DatabaseManager.getProvider and
 * backend/config.json `dbType`. Aliases 'postgres' and 'mongo' map to the
 * same providers as their long forms.
 */
export type DbType = 'sqlite' | 'postgresql' | 'postgres' | 'mongodb' | 'mongo';

/**
 * Canonical dialect label each adapter reports in
 * `ExecuteResult.metadata.dbType`.
 */
export type DbDialect = 'sqlite' | 'postgresql' | 'mongodb';

// ==== USER & SUBSCRIPTION SHAPES ====

/**
 * Stripe subscription state stored on a user.
 *
 * Written by the /api/payment webhook handlers and read by signin, usage, and
 * portal routes. SQL adapters flatten this into subscription_* columns and
 * rebuild the nested object in findUser; MongoDB stores it natively.
 * Numeric fields are numeric on every adapter: the PostgreSQL adapter
 * registers an int8 (BIGINT) type parser at driver load, so `expires` comes
 * back as a number there too, matching SQLite/MongoDB.
 */
export interface Subscription {
  /** Stripe customer ID (cus_...). */
  stripeID: string;
  /** Unix timestamp (seconds) when the current period ends; null when not set. */
  expires: number | null;
  /** Stripe subscription status (e.g. 'active', 'canceled'). */
  status: string;
  /** Set via dotted-path $set on invoice.payment_failed (persists on MongoDB only). */
  paymentFailed?: boolean;
  /** Unix timestamp (ms) of the failed payment (persists on MongoDB only). */
  paymentFailedAt?: number;
}

/**
 * Free-tier usage counter stored on a user.
 *
 * SQL adapters flatten this into usage_count / usage_reset_at columns and
 * rebuild the nested object in findUser; MongoDB stores it natively.
 */
export interface Usage {
  /** Number of operations consumed in the current window. */
  count: number;
  /** Unix timestamp (seconds) when the window resets; null until initialized. */
  reset_at: number | null;
}

/**
 * Application user as returned by findUser and inserted by insertUser.
 *
 * `subscription` exists only after a Stripe webhook has populated it;
 * `usage` exists after the first /api/usage call (SQL adapters always
 * materialize it from columns, MongoDB only once written). SQLite/PostgreSQL
 * rows may carry residual null subscription_* columns alongside these fields;
 * they are not part of the contract.
 */
export interface User {
  /** User ID (UUID v4). */
  _id: string;
  /** Normalized lowercase email (unique). */
  email: string;
  /** Display name (HTML-escaped at signup). */
  name: string;
  /** Unix timestamp (ms) of account creation. */
  created_at: number;
  /** Stripe subscription state, when present. */
  subscription?: Subscription;
  /** Free-tier usage counter, when present. */
  usage?: Usage;
}

/**
 * Lookup selector for findUser/updateUser. Exactly one of `_id` or `email`
 * is expected; adapters check `_id` first, then `email`.
 */
export interface UserQuery {
  /** User ID to match. */
  _id?: string;
  /** Email to match. */
  email?: string;
}

/**
 * Fields accepted under `$set` in a user update.
 *
 * Named keys cover the canonical columns; the index signature admits
 * MongoDB dotted-path keys (e.g. 'subscription.paymentFailed') and the
 * whitelist-filtered fields built by PUT /api/me. SQL adapters silently
 * drop keys outside their column whitelist.
 */
export interface UserSetFields {
  /** Display name. */
  name?: string;
  /** Email address. */
  email?: string;
  /** Unix timestamp (ms) of account creation. */
  created_at?: number;
  /** Full subscription replacement (maps to subscription_* columns on SQL). */
  subscription?: Subscription;
  /** Full usage replacement (maps to usage_* columns on SQL). */
  usage?: Usage;
  /** Dotted-path or whitelisted dynamic keys. */
  [field: string]: unknown;
}

/**
 * Mongo-style update document accepted by updateUser across all adapters.
 * SQL adapters emulate `$set`/`$inc`; MongoDB passes it through natively.
 */
export interface UserUpdate {
  /** Field replacements. */
  $set?: UserSetFields;
  /** Atomic increments keyed by (possibly dotted) field path, e.g. 'usage.count'. */
  $inc?: Record<string, number>;
}

// ==== AUTH SHAPES ====

/**
 * Credential record stored in the Auths table/collection, keyed by email.
 */
export interface AuthRecord {
  /** Normalized lowercase email (primary key). */
  email: string;
  /** Password hash: `scrypt$<salt>$<key>` or legacy bcrypt (`$2...`). */
  password: string;
  /** Owning user's `_id`. */
  userID: string;
}

/** Lookup selector for findAuth/updateAuth — all adapters match on email. */
export interface AuthQuery {
  /** Email of the auth record. */
  email: string;
}

/**
 * Fields accepted by updateAuth. Currently password only — used by the lazy
 * bcrypt-to-scrypt migration on successful signin.
 */
export interface AuthUpdate {
  /** New password hash. */
  password: string;
}

// ==== WEBHOOK EVENT DEDUP ====

/**
 * Processed Stripe webhook event, recorded for idempotency before handling.
 */
export interface WebhookEventRecord {
  /** Stripe event ID (evt_..., unique). */
  event_id: string;
  /** Stripe event type (e.g. 'invoice.paid'). */
  event_type: string;
  /** Unix timestamp (ms) when the event was recorded. */
  processed_at: number;
}

// ==== OPERATION RESULTS ====

/**
 * Result of an insert operation. SQLite/PostgreSQL return the inserted
 * primary key (string); MongoDB returns the driver's ObjectId — callers
 * never inspect it, so it stays `unknown`.
 */
export interface InsertResult {
  /** Inserted primary key (string on SQL adapters, ObjectId on MongoDB). */
  insertedId: unknown;
}

/** Result of an update operation across all adapters. */
export interface UpdateResult {
  /** Number of rows/documents modified. */
  modifiedCount: number;
}

/** Result of a delete operation across all adapters. */
export interface DeleteResult {
  /** Number of rows/documents deleted. */
  deletedCount: number;
}

// ==== executeQuery QUERY OBJECTS ====

/**
 * Allowed parameter values for SQL prepared statements
 * (node:sqlite and pg accept the same primitives).
 */
export type SqlParam = string | number | bigint | null | Uint8Array;

/** A single parameterized SQL statement, used standalone or in a transaction. */
export interface SqlStatement {
  /** SQL text with `?` (SQLite) or `$n` (PostgreSQL) placeholders. */
  query: string;
  /** Positional parameters. */
  params?: SqlParam[];
}

/**
 * Query object for the SQL adapters' execute(). Provide either `query`
 * (with optional `params`) or `transaction`.
 */
export interface SqlQueryObject {
  /** SQL text; required unless `transaction` is given. */
  query?: string;
  /** Positional parameters for `query`. */
  params?: SqlParam[];
  /** Statements to run atomically in a single transaction. */
  transaction?: SqlStatement[];
}

/** A single MongoDB operation inside an execute() transaction. */
export interface MongoOperation {
  /** Target collection name. */
  collection: string;
  /** Operation name: 'insertone', 'updateone', or 'deleteone'. */
  operation: string;
  /** Filter — or the document itself for insert operations. */
  query?: Record<string, unknown>;
  /** Update document for update operations. */
  update?: Record<string, unknown>;
  /** Driver options merged with the transaction session. */
  options?: Record<string, unknown>;
}

/**
 * Query object for the MongoDB adapter's execute(). `collection` and
 * `operation` are required unless `transaction` is given. For 'distinct',
 * `query` carries `{ field, filter }` by convention.
 */
export interface MongoQueryObject {
  /** Target collection name. */
  collection?: string;
  /** Operation name: findone | find | insertone | insertmany | updateone | updatemany | deleteone | deletemany | aggregate | countdocuments | distinct. */
  operation?: string;
  /** Filter, insert document(s), or operation-specific input. */
  query?: Record<string, unknown>;
  /** Update document for update operations. */
  update?: Record<string, unknown>;
  /** Aggregation pipeline stages. */
  pipeline?: Record<string, unknown>[];
  /** Driver options. */
  options?: Record<string, unknown>;
  /** Operations to run atomically in a session transaction. */
  transaction?: MongoOperation[];
}

/**
 * Provider-specific query object passed through executeQuery. The shapes
 * agree only by convention — SQL adapters read `query` as a string, MongoDB
 * reads it as a filter document — so this is a plain (non-discriminated)
 * union; adapters narrow to their own member.
 */
export type QueryObject = SqlQueryObject | MongoQueryObject;

/** Timing/dialect metadata attached to every execute() result. */
export interface ExecuteMetadata {
  /** Wall-clock duration in ms. */
  executionTime: number;
  /** Adapter that produced the result. */
  dbType: DbDialect;
}

/** Successful execute() result. `data` shape is operation-specific. */
export interface ExecuteSuccess {
  success: true;
  /** Rows for reads; counts/ids object for writes; per-statement results for transactions. */
  data: unknown;
  /** Rows returned or affected. */
  rowCount: number;
  metadata: ExecuteMetadata;
}

/** Failed execute() result — adapters catch and report instead of throwing. */
export interface ExecuteFailure {
  success: false;
  /** Human-readable error message. */
  error: string;
  /** Driver error code (string for SQL drivers, number/codeName for MongoDB). */
  code?: string | number;
  metadata: ExecuteMetadata;
}

/** Unified execute() result, discriminated on `success`. */
export type ExecuteResult = ExecuteSuccess | ExecuteFailure;

// ==== PROVIDER INTERFACE ====

/**
 * Contract every database adapter implements and DatabaseManager delegates to.
 *
 * `TDb` is the provider's connection handle: node:sqlite DatabaseSync for
 * SQLiteProvider, PoolLike (the locally-typed pg Pool surface) for
 * PostgreSQLProvider, DbLike (the locally-typed mongodb Db surface) for
 * MongoDBProvider. getDatabase may be sync (SQLite) or async — the manager
 * awaits it either way. closeAll is likewise sync on SQLite only.
 */
export interface DatabaseProvider<TDb = unknown> {
  /** One-time provider setup (e.g. ensure ./databases directory). */
  initialize(): Promise<void>;
  /** Get or create a cached connection handle for the named database. */
  getDatabase(dbName: string, connectionString?: string | null): TDb | Promise<TDb>;
  /** Find a user by _id or email; nested subscription/usage rebuilt on SQL adapters. */
  findUser(db: TDb, query: UserQuery, projection?: Record<string, unknown>): Promise<User | null>;
  /** Insert a new user record. */
  insertUser(db: TDb, userData: User): Promise<InsertResult>;
  /** Apply a $set/$inc update to a user. */
  updateUser(db: TDb, query: UserQuery, update: UserUpdate): Promise<UpdateResult>;
  /** Delete a user matched by _id or email. */
  deleteUser(db: TDb, query: UserQuery): Promise<DeleteResult>;
  /** Find a credential record by email. */
  findAuth(db: TDb, query: AuthQuery): Promise<AuthRecord | null>;
  /** Insert a credential record. */
  insertAuth(db: TDb, authData: AuthRecord): Promise<InsertResult>;
  /** Update a credential record (password rehash migration). */
  updateAuth(db: TDb, query: AuthQuery, update: AuthUpdate): Promise<UpdateResult>;
  /** Idempotency lookup for a processed Stripe webhook event. */
  findWebhookEvent(db: TDb, eventId: string): Promise<WebhookEventRecord | null>;
  /** Record a Stripe webhook event as processed. */
  insertWebhookEvent(db: TDb, eventId: string, eventType: string, processedAt: number): Promise<InsertResult>;
  /** Run a provider-specific query/operation with the unified result envelope. */
  execute(db: TDb, queryObject: QueryObject): Promise<ExecuteResult>;
  /** Close every connection this provider holds. */
  closeAll(): void | Promise<void>;
}

/**
 * Cached provider/handle pair stored in DatabaseManager.activeConnections.
 */
export interface DatabaseConnection<TDb = unknown> {
  /** Provider that owns the handle. */
  provider: DatabaseProvider<TDb>;
  /** Open connection handle. */
  database: TDb;
}

/**
 * The pre-bound `db` helper in server.ts: DatabaseManager methods with
 * dbType/db/connectionString already applied. Mirrored by the webhook test
 * doubles in server.test.ts.
 */
export interface BoundDatabase {
  findUser(query: UserQuery, projection?: Record<string, unknown>): Promise<User | null>;
  insertUser(userData: User): Promise<InsertResult>;
  updateUser(query: UserQuery, update: UserUpdate): Promise<UpdateResult>;
  /** Delete a user matched by _id or email. */
  deleteUser(query: UserQuery): Promise<DeleteResult>;
  findAuth(query: AuthQuery): Promise<AuthRecord | null>;
  insertAuth(authData: AuthRecord): Promise<InsertResult>;
  updateAuth(query: AuthQuery, update: AuthUpdate): Promise<UpdateResult>;
  findWebhookEvent(eventId: string): Promise<WebhookEventRecord | null>;
  insertWebhookEvent(eventId: string, eventType: string, processedAt: number): Promise<InsertResult>;
  executeQuery(queryObject: QueryObject): Promise<ExecuteResult>;
}

// ==== AUTH / SESSION SHAPES ====

/**
 * JWT payload produced by jwtSign and returned by jwtVerify (HS256).
 */
export interface JwtPayload {
  /** Authenticated user's `_id` (normalized to string by authMiddleware). */
  userID: string;
  /** Expiration as a Unix timestamp (seconds). */
  exp: number;
}

/** Per-user entry in the in-memory CSRF token store. */
export interface CsrfTokenEntry {
  /** 64-char hex CSRF token. */
  token: string;
  /** Unix timestamp (ms) when the token was issued. */
  timestamp: number;
}

// ==== LOGGING & CONFIG ====

/**
 * Structured logger shape used by server.ts and injectable into the webhook
 * test harness (noopLogger in server.test.ts).
 */
export interface Logger {
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

/**
 * `database` block of backend/config.json after env-var placeholder
 * resolution. `dbType` is a free string at the config boundary; supported
 * values are documented by DbType.
 */
export interface DatabaseConfig {
  /** Database name. */
  db: string;
  /** Database type (see DbType for supported values). */
  dbType: string;
  /** Connection string or SQLite file path. */
  connectionString: string;
}

/** Fully resolved backend configuration loaded by server.ts. */
export interface BackendConfig {
  /** Directory of built frontend assets to serve statically. */
  staticDir: string;
  /** Database connection settings. */
  database: DatabaseConfig;
}
