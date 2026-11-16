import path from 'node:path';
import { moduleSourceVisitors, mergeVisitors, packageName } from '../lib/moduleSources.js';

/** Config files that only exist for the banned PostCSS / Tailwind toolchain. */
const BANNED_CONFIG_FILE = /^(?:tailwind|postcss)\.config\.[cm]?[jt]s$|^\.postcssrc(?:\.[cm]?[jt]s|\.json)?$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never use Tailwind (tailwindcss, @tailwindcss/*), PostCSS, autoprefixer, or `tailwind.config.js`: styling is plain CSS (skateboard-ui\'s styles.css plus src/assets/styles.css). No `@vitejs/plugin-react-swc`; never set `optimizeDeps.force: true`.',
      source: 'AGENTS.md > Prohibited Tools & Practices / Styling & UI / Build System Integration',
    },
    schema: [],
    messages: {
      cssToolchain:
        'Found an import of "{{source}}". Why: skateboard apps run no CSS build step since skateboard 5.20.0: skateboard-ui ships plain CSS and the app owns plain CSS in src/assets/styles.css, and Vite (Lightning CSS) already handles nesting and vendor prefixes. Tailwind or PostCSS here would bring the toolchain back and regenerate classes the plain CSS no longer has. ' +
        'Fix: delete the import (and the package); put theme values in src/assets/styles.css as plain variables (`:root { --color-app: ...; }`) and write any new class as plain CSS there.',
      configFile:
        'Found the file {{file}}. Why: the template runs no Tailwind or PostCSS (plain CSS since skateboard 5.20.0), so this file is either ignored or silently pulls the toolchain back in. ' +
        'Fix: delete it; theme values go in src/assets/styles.css as plain variables (`:root { --color-app: ...; }`).',
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
        if (pkg === 'postcss' || pkg.startsWith('postcss-') || pkg === 'autoprefixer' || pkg === 'tailwindcss' || pkg.startsWith('@tailwindcss/')) {
          context.report({ node, messageId: 'cssToolchain', data: { source } });
        } else if (pkg === '@vitejs/plugin-react-swc') {
          context.report({ node, messageId: 'swc', data: { source } });
        }
      }),
    );
  },
};
