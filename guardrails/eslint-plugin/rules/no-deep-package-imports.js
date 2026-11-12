import { moduleSourceVisitors, packageName } from '../lib/moduleSources.js';

/**
 * Classify a specifier that reaches past a package's public entry points.
 *
 * @param {string} source - Import specifier
 * @returns {'nodeModules' | 'lucide' | 'dist' | null} Kind of deep import, or null when fine
 */
function deepKind(source) {
  if (/(^|\/)node_modules\//.test(source)) return 'nodeModules';
  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('@/')) return null;
  const pkg = packageName(source);
  const subpath = source.slice(pkg.length);
  if (pkg === 'lucide-react' && subpath) return 'lucide';
  // `lib/` is left out on purpose: some packages document it as public (highlight.js/lib/core).
  if (/^\/(dist|build|esm|cjs)(\/|$)/.test(subpath)) return 'dist';
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Never import package internals: no 'lucide-react/dist/...' or 'lucide-react/icons/...', no path containing node_modules/, no '@stevederico/skateboard-ui/dist/...'.",
      source: 'AGENTS.md > Icons / Guardrails',
    },
    schema: [],
    messages: {
      nodeModules:
        'Found an import through node_modules ("{{source}}"). Why: it hard-codes one install layout (hoisting, workspaces, and Docker builds differ) and skips the package\'s `exports` map, so it breaks on the next install. ' +
        'Fix: import the package by name (`import { Button } from "@stevederico/skateboard-ui/shadcn/ui/button"`).',
      lucide:
        'Found a deep lucide-react import ("{{source}}"). Why: lucide\'s internal file layout is not public API and changes between versions; deep paths also bypass the app icon funnel. ' +
        'Fix: add the icon by name to src/icons.ts (`export { {{hint}} } from "lucide-react";`) and import it from the funnel (`import { {{hint}} } from "../icons";`).',
      dist:
        'Found an import of a build-output path ("{{source}}"). Why: dist/ (and build/, esm/, cjs/) files are a package\'s private build artifacts; they skip its `exports` map and move between releases. skateboard-ui publishes stable subpaths instead. ' +
        'Fix: use the public subpath, e.g. "@stevederico/skateboard-ui/Utilities", "@stevederico/skateboard-ui/shadcn/ui/<component>", "@stevederico/skateboard-ui/Header" (see the package README and `exports`).',
    },
  },
  create(context) {
    return moduleSourceVisitors((node, source) => {
      const kind = deepKind(source);
      if (!kind) return;
      const last = source.split('/').pop() ?? '';
      // `lucide-react/dist/esm/icons/trash-2` -> `Trash2` as a hint for the funnel name.
      const hint = last.replace(/\.[cm]?js$/, '').replace(/(^|-)([a-z0-9])/g, (_m, _d, c) => c.toUpperCase()) || 'IconName';
      context.report({ node, messageId: kind, data: { source, hint } });
    });
  },
};
