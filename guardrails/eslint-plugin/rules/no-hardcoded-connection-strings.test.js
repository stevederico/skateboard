import rule from './no-hardcoded-connection-strings.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-hardcoded-connection-strings', rule, {
  valid: [
    { code: 'const url = process.env.DATABASE_URL;', filename: 'scripts/tool.js' },
    { code: "const docs = 'https://example.com/postgres';", filename: 'scripts/tool.js' },
    { code: "const path = './databases/MyApp.db';", filename: 'scripts/tool.js' },
  ],
  invalid: [
    { code: "const url = 'mongodb://admin:hunter2@db.internal:27017/app';", filename: 'scripts/tool.js', errors: [{ messageId: 'connection' }] },
    { code: "const url = 'postgres://user:pw@localhost/app';", errors: [{ messageId: 'connection' }] },
    { code: 'const url = `mysql://root:${pw}@localhost/app`;', filename: 'scripts/tool.js', errors: [{ messageId: 'connection' }] },
    { code: "connect('mongodb+srv://cluster0.example.net/app');", filename: 'scripts/tool.js', errors: [{ messageId: 'connection' }] },
  ],
});
