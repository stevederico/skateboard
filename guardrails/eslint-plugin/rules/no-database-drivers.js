import { createBannedImportRule, packages } from '../lib/bannedImports.js';

/** Database drivers, ORMs, and query builders. The backend owns SQLite through libsqlite3 FFI. */
const DATABASE_PACKAGES = [
  'pg',
  'pg-promise',
  'postgres',
  '@neondatabase/serverless',
  '@vercel/postgres',
  'mysql',
  'mysql2',
  '@planetscale/database',
  'mariadb',
  'mongodb',
  'mongoose',
  'sqlite',
  'sqlite3',
  'better-sqlite3',
  '@libsql/client',
  'libsql',
  'tedious',
  'mssql',
  'oracledb',
  'knex',
  'kysely',
  'sequelize',
  'typeorm',
  'prisma',
  '@prisma/client',
  'drizzle-orm',
  '@mikro-orm/core',
];

export default createBannedImportRule({
  description:
    'Never add a database driver package: the backend is SQLite through system `libsqlite3` FFI. Postgres and Mongo are not supported.',
  source: 'AGENTS.md > Prohibited Tools & Practices / Backend Stack',
  entries: [
    {
      match: packages(DATABASE_PACKAGES),
      why:
        'all data access lives in the zero-crate Rust backend (backend/src/db.rs over libsqlite3). A JS driver either ships database credentials to the browser or creates a second, unaudited data layer beside the backend.',
      fix:
        'add a route in backend/src/routes.rs (schema in backend/src/db.rs ensure_schema) and call it from the frontend with `useListData("/items")` or `apiRequest("/items", { method: "POST", ... })` from "@stevederico/skateboard-ui/Utilities".',
    },
  ],
});
