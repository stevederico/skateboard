const GROUP_NAMES = ['external package', 'internal (@/) module', 'relative path'];

/**
 * Group index for an import specifier: 0 external (incl. `node:`), 1 internal `@/`, 2 relative.
 *
 * @param {string} source - Import specifier
 * @returns {number} Group index
 */
function groupOf(source) {
  if (source.startsWith('@/')) return 1;
  if (source.startsWith('.') || source.startsWith('/')) return 2;
  return 0;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Imports ordered: external packages → internal modules → relative paths.',
      source: 'AGENTS.md > Code Organization',
    },
    schema: [],
    messages: {
      order:
        'Found the {{group}} import "{{source}}" after the {{laterGroup}} import "{{later}}". Why: a fixed order (external → internal @/ → relative) lets a reader see a file\'s dependencies and layer reach at a glance, and keeps diffs from reshuffling imports. ' +
        'Fix: move "{{source}}" above "{{later}}". Side-effect imports such as `import "./assets/styles.css"` are exempt and may stay first.',
    },
  },
  create(context) {
    return {
      Program(program) {
        let highest = -1;
        let highestNode = null;
        for (const node of program.body) {
          if (node.type !== 'ImportDeclaration' || node.specifiers.length === 0) continue;
          const source = String(node.source.value);
          const group = groupOf(source);
          if (group < highest && highestNode) {
            context.report({
              node,
              messageId: 'order',
              data: {
                group: GROUP_NAMES[group],
                source,
                laterGroup: GROUP_NAMES[highest],
                later: String(highestNode.source.value),
              },
            });
            return;
          }
          if (group > highest) {
            highest = group;
            highestNode = node;
          }
        }
      },
    };
  },
};
