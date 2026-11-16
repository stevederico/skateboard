import path from 'node:path';
import { moduleSourceVisitors, mergeVisitors, packageName } from '../lib/moduleSources.js';
import { repoRelative } from '../lib/paths.js';

/** The one module allowed to import the icon package. `.tsx` once it holds local SVG components. */
export const ICON_FUNNEL = /^src\/icons\.tsx?$/;

/** The vendored Lucide icon set the app re-exports (skateboard-ui 5.13+). */
export const ICON_PACKAGE = '@stevederico/skateboard-ui/icons';

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

/**
 * Names imported or re-exported by a declaration, for the suggested fix.
 *
 * @param {any} node - Declaration node, or the source/call node inside one
 * @returns {string} Comma-separated names, or a placeholder
 */
function importedNames(node) {
  const decl = node.specifiers ? node : node.parent;
  const names = (decl?.specifiers ?? [])
    .filter((s) => s.type === 'ImportSpecifier' || s.type === 'ExportSpecifier')
    .map((s) => {
      const id = s.type === 'ImportSpecifier' ? s.imported : s.local;
      return id.type === 'Identifier' ? id.name : id.value;
    });
  return names.length ? names.join(', ') : 'IconName';
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Import icons only from the app icon module src/icons.ts (an explicit, named re-export of '@stevederico/skateboard-ui/icons'); never import that package anywhere else, and never import 'lucide-react'.",
      source: 'AGENTS.md > Icons / skills/skateboard/rules/icons.md',
    },
    schema: [],
    messages: {
      direct:
        'Found an import of "{{source}}" outside src/icons.ts. Why: one funnel file keeps the icon set auditable (one list shows every icon the app ships), tree-shakeable (named re-exports only), and swappable (a local SVG replaces a shipped icon in one place). ' +
        `Fix: add the names to the explicit list in src/icons.ts (\`export { {{names}} } from "${ICON_PACKAGE}";\`) and import them here with \`import { {{names}} } from "{{funnel}}";\`.`,
      lucide:
        'Found an import of "{{source}}". Why: lucide-react is not a dependency; skateboard-ui 5.13+ vendors the Lucide icons the shell and apps use, so this import fails to resolve (or pulls a second copy of every icon). ' +
        `Fix: re-export the icon from the vendored set in src/icons.ts (\`export { {{names}} } from "${ICON_PACKAGE}";\`) and import it from the funnel (\`import { {{names}} } from "{{funnel}}";\`). If the icon is not shipped, add a local SVG component to src/icons.tsx.`,
      starExport:
        `Found \`export * from "${ICON_PACKAGE}"\` in the icon funnel. Why: a star re-export makes every shipped icon importable, so the funnel no longer documents which icons the app uses and bundle audits lose their list. ` +
        `Fix: list each icon explicitly: \`export { Plus, Trash2 } from "${ICON_PACKAGE}";\`.`,
      namespaceImport:
        `Found a namespace import of "${ICON_PACKAGE}" in the icon funnel. Why: \`import * as Icons\` defeats the explicit list and hides which icons are used. ` +
        `Fix: re-export by name: \`export { Plus, Trash2 } from "${ICON_PACKAGE}";\`.`,
    },
  },
  create(context) {
    const isFunnel = ICON_FUNNEL.test(repoRelative(context));
    const funnel = isFunnel ? './icons' : funnelSpecifier(context);

    const sourceVisitors = moduleSourceVisitors((node, source) => {
      if (packageName(source) === 'lucide-react') {
        context.report({ node, messageId: 'lucide', data: { source, names: importedNames(node), funnel } });
      } else if (source === ICON_PACKAGE && !isFunnel) {
        context.report({ node, messageId: 'direct', data: { source, names: importedNames(node), funnel } });
      }
    });
    if (!isFunnel) return sourceVisitors;

    return mergeVisitors(sourceVisitors, {
      ExportAllDeclaration(node) {
        if (node.source.value === ICON_PACKAGE) context.report({ node, messageId: 'starExport' });
      },
      ImportDeclaration(node) {
        if (node.source.value !== ICON_PACKAGE) return;
        if (node.specifiers.some((s) => s.type === 'ImportNamespaceSpecifier')) context.report({ node, messageId: 'namespaceImport' });
      },
    });
  },
};
