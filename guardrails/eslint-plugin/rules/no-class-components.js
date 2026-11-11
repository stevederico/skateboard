const BASES = new Set(['Component', 'PureComponent', 'React.Component', 'React.PureComponent']);

/**
 * Name of a class's superclass (`Component`, `React.Component`), or '' when not static.
 *
 * @param {any} node - Superclass expression
 * @returns {string} Dotted name
 */
function superName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier') {
    return `${node.object.name}.${node.property.name}`;
  }
  return '';
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer functional components, never class components.',
      source: 'AGENTS.md > React Rules',
    },
    schema: [],
    messages: {
      classComponent:
        'Found a class component extending `{{base}}`. Why: the skateboard-ui shell, hooks (`useListData`, `useSafeNavigate`, `getState`) and React 19 features only work in function components, and class lifecycles hide fetch/cleanup bugs. ' +
        'Fix: rewrite as `export default function Name(props: NameProps) { ... }`, move state to `useState`, side effects to event handlers or `useEffect` (no data fetching there; use `useListData`).',
    },
  },
  create(context) {
    const check = (node) => {
      const base = superName(node.superClass);
      if (BASES.has(base)) context.report({ node, messageId: 'classComponent', data: { base } });
    };
    return { ClassDeclaration: check, ClassExpression: check };
  },
};
