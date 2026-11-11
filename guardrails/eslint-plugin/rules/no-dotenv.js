import { createBannedImportRule, packages } from '../lib/bannedImports.js';

export default createBannedImportRule({
  description: 'Never use dotenv: manually load the `.env` file.',
  source: 'AGENTS.md > Prohibited Tools & Practices',
  entries: [
    {
      match: packages(['dotenv', 'dotenv-expand', 'dotenv-flow', 'dotenv-safe', '@dotenvx/dotenvx']),
      why:
        'the repo keeps env loading explicit and dependency-free. The Rust backend parses backend/.env by hand (backend/src/config.rs) and skips it in production; a dotenv package adds a supply-chain dependency for what Node already does.',
      fix:
        'in Node scripts call `process.loadEnvFile(".env")` (built into Node 24) or run `node --env-file=.env`; in frontend code read `import.meta.env.VITE_*`; backend env vars belong in backend/.env, read by config.rs.',
    },
  ],
});
