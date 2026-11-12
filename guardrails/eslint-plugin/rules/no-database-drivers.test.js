import rule from './no-database-drivers.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-database-drivers', rule, {
  valid: [
    "import { useListData } from '@stevederico/skateboard-ui/Utilities';",
    { code: "import { DatabaseSync } from 'node:sqlite';", filename: 'scripts/tool.js' },
    "import pgpLogo from './pg-logo.svg';",
  ],
  invalid: [
    { code: "import pg from 'pg';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "import { MongoClient } from 'mongodb';", errors: [{ messageId: 'banned' }] },
    { code: "import mongoose from 'mongoose';", errors: [{ messageId: 'banned' }] },
    { code: "import Database from 'better-sqlite3';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "import { createClient } from '@libsql/client/web';", errors: [{ messageId: 'banned' }] },
    { code: "import mysql from 'mysql2/promise';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
  ],
});
