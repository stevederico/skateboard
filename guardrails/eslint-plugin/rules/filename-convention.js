import path from 'node:path';
import { repoRelative } from '../lib/paths.js';

const PASCAL_TSX = /^[A-Z][A-Za-z0-9]*(\.test)?\.tsx$/;
const CAMEL_TS = /^[a-z][A-Za-z0-9]*(\.test|\.d)?\.ts$/;
const JS_EXT = /\.(js|jsx|mjs|cjs)$/;

/**
 * Convert a file stem to PascalCase or camelCase (`home-view` → `HomeView` / `homeView`).
 *
 * @param {string} stem - File name without extension
 * @param {boolean} pascal - PascalCase when true, camelCase otherwise
 * @returns {string} Converted stem
 */
function recase(stem, pascal) {
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  const joined = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return pascal ? joined : joined[0].toLowerCase() + joined.slice(1);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'TypeScript everywhere (`.ts` / `.tsx`); files: components as `PascalCase.tsx`, everything else `camelCase.ts`.',
      source: 'AGENTS.md > Naming Conventions; AGENTS.md > TypeScript Style',
    },
    schema: [],
    messages: {
      javascript:
        'Found the JavaScript file "{{file}}" in src/. Why: src/ is TypeScript-only under strict mode, and `npm run typecheck` does not check .js/.jsx files, so their bugs ship unchecked. ' +
        'Fix: rename it to "{{renamed}}" and add types (no `any`, no `as` casts).',
      component:
        'Found the component file "{{file}}" not in PascalCase. Why: components live in PascalCase.tsx files named after the component, so imports and lazy routes stay predictable. ' +
        'Fix: rename it to "{{renamed}}" and update its imports (src/main.tsx lazy routes included).',
      module:
        'Found the module "{{file}}" not in camelCase. Why: non-component modules are camelCase.ts, so the name tells a reader it is not a component. ' +
        'Fix: rename it to "{{renamed}}" and update its imports.',
    },
  },
  create(context) {
    const rel = repoRelative(context);
    if (!rel.startsWith('src/')) return {};
    const file = path.basename(rel);
    const isComponentDir = rel.startsWith('src/components/');
    return {
      Program(node) {
        if (JS_EXT.test(file)) {
          const ext = /\.jsx$/.test(file) || isComponentDir ? '.tsx' : '.ts';
          context.report({ node, messageId: 'javascript', data: { file: rel, renamed: file.replace(JS_EXT, ext) } });
          return;
        }
        const [stem] = file.split('.');
        const suffix = file.slice(stem.length);
        if (isComponentDir && file.endsWith('.tsx') && !PASCAL_TSX.test(file)) {
          context.report({ node, messageId: 'component', data: { file: rel, renamed: recase(stem, true) + suffix } });
        } else if (file.endsWith('.ts') && !CAMEL_TS.test(file)) {
          context.report({ node, messageId: 'module', data: { file: rel, renamed: recase(stem, false) + suffix } });
        }
      },
    };
  },
};
