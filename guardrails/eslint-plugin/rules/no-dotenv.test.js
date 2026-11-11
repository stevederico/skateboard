import rule from './no-dotenv.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-dotenv', rule, {
  valid: [
    { code: "process.loadEnvFile('.env');", filename: 'scripts/tool.js' },
    { code: 'const url = import.meta.env.VITE_API_URL;', filename: 'src/main.tsx' },
  ],
  invalid: [
    { code: "import 'dotenv/config';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "import dotenv from 'dotenv';", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
    { code: "const { config } = await import('@dotenvx/dotenvx');", filename: 'scripts/tool.js', errors: [{ messageId: 'banned' }] },
  ],
});
