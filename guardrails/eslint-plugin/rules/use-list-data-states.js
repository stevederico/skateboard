const REQUIRED = ['loading', 'error'];

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Every data-fetching view handles 3 states: loading, error, data.',
      source: 'AGENTS.md > React Rules; skills/skateboard/rules/views.md > Data Fetching',
    },
    schema: [],
    messages: {
      missingStates:
        'Found `useListData(...)` destructured without {{missing}}. Why: ignoring them shows a blank screen while loading and silently drops failed requests, which the repo forbids ("no silent failures"). ' +
        'Fix: `const { data, loading, error, refetch } = useListData(...)`; `if (loading) return <ViewSkeleton />;` and `if (error)` render `<Empty>` with the message and `<Button onClick={refetch}>Try again</Button>` (Empty from `@stevederico/skateboard-ui/shadcn/ui/empty`).',
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const init = node.init?.type === 'AwaitExpression' ? node.init.argument : node.init;
        if (node.id.type !== 'ObjectPattern' || init?.type !== 'CallExpression') return;
        if (init.callee.type !== 'Identifier' || init.callee.name !== 'useListData') return;
        if (node.id.properties.some((p) => p.type === 'RestElement')) return;
        const keys = node.id.properties.map((p) => (p.key.type === 'Identifier' ? p.key.name : p.key.value));
        const missing = REQUIRED.filter((k) => !keys.includes(k));
        if (missing.length) {
          context.report({ node: node.id, messageId: 'missingStates', data: { missing: missing.map((m) => `\`${m}\``).join(' and ') } });
        }
      },
    };
  },
};
