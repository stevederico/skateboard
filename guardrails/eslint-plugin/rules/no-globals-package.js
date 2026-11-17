import { createBannedImportRule, packages } from '../lib/bannedImports.js';

export default createBannedImportRule({
  description: 'Never use the `globals` package.',
  source: 'AGENTS.md > Prohibited Tools & Practices',
  entries: [
    {
      match: packages(['globals']),
      why:
        'it only feeds environment globals to a linter\'s `no-undef`, which this repo does not use (oxlint runs only the guardrails plugin and four core rules): TypeScript (`npm run typecheck`, tsconfig "lib" and "types") already knows every browser and Node global. The guardrails plugin stays zero-dependency.',
      fix:
        'delete the import (and any `globals` entry in a lint config). If a global is missing from typechecking, add the right lib or `@types` package to tsconfig.json "types" (dev-only).',
    },
  ],
});
