import path from 'node:path';
import { moduleSourceVisitors, mergeVisitors, packageName } from '../lib/moduleSources.js';
import { repoRelative } from '../lib/paths.js';

/** The one module allowed to import lucide-react. `.tsx` once it holds vendored SVG components. */
export const ICON_FUNNEL = /^src\/icons\.tsx?$/;

/**
 * Relative specifier from the linted file to src/icons, e.g. `../icons` from src/components.
 *
 * @param {import('eslint').Rule.RuleContext} context - Rule context
 * @returns {string} Specifier to suggest in the message
 */
function funnelSpecifier(context) {
  const fromDir = path.dirname(repoRelative(context));
  const rel = path.posix.relative(fromDir, 'src/icons');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Import icons only from the app icon module src/icons.ts (an explicit, named re-export list); never import 'lucide-react' anywhere else.",
      source: 'AGENTS.md > Icons / skills/skateboard/rules/icons.md',
    },
    schema: [],
    messages: {
      direct:
        'Found an import of "{{source}}" outside src/icons.ts. Why: one funnel file keeps the icon set auditable (one list shows every icon the app ships), tree-shakeable (named re-exports only), and swappable (vendored SVGs replace Lucide in one place). ' +
        'Fix: add the names to the explicit list in src/icons.ts (`export { {{names}} } from "lucide-react";`) and import them here with `import { {{names}} } from "{{funnel}}";`.',
      starExport:
        'Found `export * from "lucide-react"` in the icon funnel. Why: a star re-export makes every Lucide icon importable, so the funnel no longer documents which icons the app uses and bundle audits lose their list. ' +
        'Fix: list each icon explicitly: `export { Plus, Trash2 } from "lucide-react";`.',
      namespaceImport:
        'Found a namespace import of lucide-react in the icon funnel. Why: `import * as Icons` defeats the explicit list and hides which icons are used. ' +
        'Fix: re-export by name: `export { Plus, Trash2 } from "lucide-react";`.',
    },
  },
  create(context) {
    const isFunnel = ICON_FUNNEL.test(repoRelative(context));
    const isLucide = (source) => packageName(source) === 'lucide-react';

    /**
     * Names imported by an import declaration, for the suggested fix.
     *
     * @param {any} node - Specifier node
     * @returns {string} Comma-separated names, or a placeholder
     */
    function importedNames(node) {
      const decl = node.parent;
      const names = (decl.specifiers ?? [])
        .filter((s) => s.type === 'ImportSpecifier')
        .map((s) => (s.imported.type === 'Identifier' ? s.imported.name : s.imported.value));
      return names.length ? names.join(', ') : 'IconName';
    }

    if (!isFunnel) {
      return moduleSourceVisitors((node, source) => {
        if (!isLucide(source)) return;
        context.report({ node, messageId: 'direct', data: { source, names: importedNames(node), funnel: funnelSpecifier(context) } });
      });
    }

    return mergeVisitors({
      ExportAllDeclaration(node) {
        if (isLucide(node.source.value)) context.report({ node, messageId: 'starExport' });
      },
      ImportDeclaration(node) {
        if (!isLucide(node.source.value)) return;
        if (node.specifiers.some((s) => s.type === 'ImportNamespaceSpecifier')) context.report({ node, messageId: 'namespaceImport' });
      },
    });
  },
};
