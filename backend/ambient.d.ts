/**
 * Ambient module stubs for optional, lazily-imported database drivers.
 *
 * `pg` and `mongodb` are NOT installed — adapters/postgres.ts and
 * adapters/mongodb.ts are dynamically imported by the manager only when
 * configured, and apps that use them install the driver themselves. These
 * declarations cover only the surface those two files actually touch;
 * everything else is intentionally absent. Values nobody inspects stay
 * `unknown` rather than pretending to be precise.
 */

declare module 'pg' {
  /** Loose row/options document. */
  type Row = Record<string, unknown>;

  /**
   * Result of a query: `rows` for SELECT, `rowCount` for mutations.
   * (The real driver can report null rowCount for non-row commands; this
   * codebase only reads it after INSERT/UPDATE/DELETE, where it is a number.)
   */
  export interface QueryResult<R = Row> {
    rows: R[];
    rowCount: number;
  }

  /** A client checked out of the pool; must be released back. */
  export interface PoolClient {
    query<R = Row>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
    release(): void;
  }

  /** Pool options used by adapters/postgres.ts. */
  export interface PoolConfig {
    connectionString?: string;
    ssl?: boolean | Row;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  }

  /** Connection pool — the only entry point the adapter uses. */
  export class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R = Row>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }

  const pg: { Pool: typeof Pool };
  export default pg;
}

declare module 'mongodb' {
  /** Loose BSON document (filters, updates, options, rows). */
  export type Document = Record<string, unknown>;

  /** Cursor returned by find/aggregate; only toArray is used. */
  export interface FindCursor<T = Document> {
    toArray(): Promise<T[]>;
  }

  /** Result of insertOne. `insertedCount` is read defensively by the adapter
   * (`result.insertedCount || 0`) though modern drivers omit it. */
  export interface InsertOneResult {
    insertedId: unknown;
    insertedCount?: number;
  }

  /** Result of insertMany. */
  export interface InsertManyResult {
    insertedIds: Record<number, unknown>;
    insertedCount: number;
  }

  /** Result of updateOne/updateMany. */
  export interface UpdateResult {
    matchedCount: number;
    modifiedCount: number;
    upsertedCount: number;
    upsertedId: unknown;
  }

  /** Result of deleteOne/deleteMany. */
  export interface DeleteResult {
    deletedCount: number;
  }

  /** Session handle used for transactions. */
  export interface ClientSession {
    withTransaction(fn: () => Promise<void>): Promise<unknown>;
    endSession(): Promise<void>;
  }

  /** Collection surface used by adapters/mongodb.ts. */
  export interface Collection<T = Document> {
    createIndex(spec: Document, options?: Document): Promise<string>;
    findOne(filter?: Document, options?: Document): Promise<T | null>;
    find(filter?: Document, options?: Document): FindCursor<T>;
    insertOne(doc: Document, options?: Document): Promise<InsertOneResult>;
    insertMany(docs: Document[], options?: Document): Promise<InsertManyResult>;
    updateOne(filter: Document, update: Document, options?: Document): Promise<UpdateResult>;
    updateMany(filter: Document, update: Document, options?: Document): Promise<UpdateResult>;
    deleteOne(filter: Document, options?: Document): Promise<DeleteResult>;
    deleteMany(filter: Document, options?: Document): Promise<DeleteResult>;
    aggregate(pipeline?: Document[], options?: Document): FindCursor<T>;
    countDocuments(filter?: Document, options?: Document): Promise<number>;
    distinct(key: string, filter?: Document, options?: Document): Promise<unknown[]>;
  }

  /** Entry returned by listCollections().toArray(). */
  export interface CollectionInfo {
    name: string;
  }

  /** Cursor over collection metadata; only toArray is used. */
  export interface ListCollectionsCursor {
    toArray(): Promise<CollectionInfo[]>;
  }

  /** Database handle returned by client.db(). */
  export interface Db {
    /** Owning client — adapters/mongodb.ts calls db.client.startSession(). */
    client: MongoClient;
    collection(name: string): Collection;
    createCollection(name: string): Promise<Collection>;
    listCollections(): ListCollectionsCursor;
  }

  /** Client options used by adapters/mongodb.ts. */
  export interface MongoClientOptions {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  }

  /** MongoDB client — the only entry point the adapter uses. */
  export class MongoClient {
    constructor(url: string, options?: MongoClientOptions);
    connect(): Promise<MongoClient>;
    db(name?: string): Db;
    startSession(): ClientSession;
    close(): Promise<void>;
  }
}
