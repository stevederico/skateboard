import { createBannedImportRule, packages } from '../lib/bannedImports.js';

export default createBannedImportRule({
  description: 'Never use the `globals` package.',
  source: 'AGENTS.md > Prohibited Tools & Practices',
  entries: [
    {
      match: packages(['globals']),
      why:
        'it only feeds environment globals to ESLint\'s `no-undef`, which this repo does not use: TypeScript (`npm run typecheck`, tsconfig "lib" and "types") already knows every browser and Node global. The guardrails plugin stays zero-dependency.',
      fix:
        'delete the import and the `languageOptions.globals` entry. If a global is missing from typechecking, add the right lib or `@types` package to tsconfig.json "types" (dev-only).',
    },
  ],
});
