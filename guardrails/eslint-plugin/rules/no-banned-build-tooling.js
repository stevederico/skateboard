import path from 'node:path';
import { moduleSourceVisitors, mergeVisitors, packageName } from '../lib/moduleSources.js';

/** Config files that only exist for the banned PostCSS / Tailwind v3 toolchain. */
const BANNED_CONFIG_FILE = /^(?:tailwind|postcss)\.config\.[cm]?[jt]s$|^\.postcssrc(?:\.[cm]?[jt]s|\.json)?$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never use PostCSS, autoprefixer, or `tailwind.config.js`; always Tailwind v4 via @tailwindcss/vite. No `@vitejs/plugin-react-swc`; never set `optimizeDeps.force: true`.',
      source: 'AGENTS.md > Prohibited Tools & Practices / Styling & UI / Build System Integration',
    },
    schema: [],
    messages: {
      cssToolchain:
        'Found an import of "{{source}}". Why: Tailwind v4 runs through the @tailwindcss/vite plugin with Lightning CSS, which already handles nesting and vendor prefixes; a PostCSS pipeline duplicates that work and drifts from the template. ' +
        'Fix: delete the import; keep `tailwindcss()` from "@tailwindcss/vite" in vite.config.ts and put theme values in src/assets/styles.css under `@theme { ... }`.',
      configFile:
        'Found the file {{file}}. Why: Tailwind v4 is configured in CSS, not JS, and the template has no PostCSS step, so this file is either ignored or silently pulls in the v3 toolchain. ' +
        'Fix: delete it; move theme tokens to src/assets/styles.css (`@theme { --color-app: ...; }`) and content globs to `@source "..."` lines in the same file.',
      swc:
        'Found an import of "{{source}}". Why: the template compiles JSX with Vite\'s built-in esbuild (tsconfig "jsx": "react-jsx"); the SWC plugin was dropped in 5.0 and re-adding it brings back a native binary and a second JSX pipeline. ' +
        'Fix: remove the plugin from vite.config.ts and package.json; edits full-reload by design.',
      forceOptimize:
        'Found `optimizeDeps.force: true`. Why: it re-bundles every dependency on every dev start, which makes `npm run start` slow for no benefit. ' +
        'Fix: delete the `force` key (and never pass `vite --force` in scripts). To clear a stale cache once, delete node_modules/.vite.',
    },
  },
  create(context) {
    const file = path.basename(context.filename);
    return mergeVisitors(
      {
        Program(node) {
          if (BANNED_CONFIG_FILE.test(file)) context.report({ node, messageId: 'configFile', data: { file } });
        },
        Property(node) {
          const keyName = node.key.type === 'Identifier' ? node.key.name : node.key.value;
          if (keyName !== 'force' || node.value.type !== 'Literal' || node.value.value !== true) return;
          const owner = node.parent.parent;
          const ownerKey = owner?.type === 'Property' ? (owner.key.name ?? owner.key.value) : null;
          if (ownerKey === 'optimizeDeps') context.report({ node, messageId: 'forceOptimize' });
        },
      },
      moduleSourceVisitors((node, source) => {
        const pkg = packageName(source);
        if (pkg === 'postcss' || pkg.startsWith('postcss-') || pkg === 'autoprefixer' || pkg === '@tailwindcss/postcss') {
          context.report({ node, messageId: 'cssToolchain', data: { source } });
        } else if (pkg === '@vitejs/plugin-react-swc') {
          context.report({ node, messageId: 'swc', data: { source } });
        }
      }),
    );
  },
};
