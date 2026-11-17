const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

const REQUEST_FUNCTIONS = new Set([
  'fetch',
  'apiRequest',
  'apiRequestWithParams',
  'getCurrentUser',
  'isSubscriber',
  'getRemainingUsage',
  'trackUsage',
  'showCheckout',
  'showManage',
]);

const REQUEST_CONSTRUCTORS = new Set(['XMLHttpRequest']);

const SKIP_KEYS = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

function hookName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;
  return null;
}

function requestName(node) {
  const { callee } = node;
  const name = callee.type === 'Identifier' ? callee.name : null;
  const member =
    callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && ['window', 'globalThis', 'self'].includes(callee.object.name)
      ? callee.property.name
      : null;
  const called = name ?? member;
  if (!called) return null;
  if (node.type === 'NewExpression') return REQUEST_CONSTRUCTORS.has(called) ? called : null;
  return REQUEST_FUNCTIONS.has(called) ? called : null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never fetch in `useEffect` directly: use `useListData`. Every data-fetching view handles loading, error, and data.',
      source: 'skills/skateboard/rules/views.md > Data Fetching; docs/GUIDE.md > Best Practices (Use Hooks for Data Fetching)',
    },
    schema: [],
    messages: {
      fetchInEffect:
        'Found `{{call}}()` running inside `{{hook}}`{{via}}. Why: fetching in an effect causes race conditions (a slow old response overwrites a newer one), double requests under React StrictMode, and views with no loading or error state. ' +
        'Fix: for reads use `const { data, loading, error, refetch } = useListData("/endpoint");` from "@stevederico/skateboard-ui/Utilities" and render all three states; for mutations call `await apiRequest(...)` inside an event handler (`handleSave`) wrapped in try/catch with `toast.error(...)`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function resolveFunction(identifier) {
      let scope = sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
          const def = variable.defs[0];
          if (!def) return null;
          if (def.node.type === 'FunctionDeclaration') return def.node;
          const init = def.node.type === 'VariableDeclarator' ? def.node.init : null;
          if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') return init;
          const isCallback = init?.type === 'CallExpression' && hookName(init.callee) === 'useCallback';
          return isCallback ? init.arguments[0] ?? null : null;
        }
        scope = scope.upper;
      }
      return null;
    }

    function findRequest(root, visited) {
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        if (node.type === 'CallExpression' || node.type === 'NewExpression') {
          const call = requestName(node);
          if (call) return { node, call, via: null };
          if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
            const fn = resolveFunction(node.callee);
            if (fn && !visited.has(fn)) {
              visited.add(fn);
              const found = findRequest(fn.body, visited);
              if (found) return { node, call: found.call, via: found.via ?? node.callee.name };
            }
          }
        }
        for (const [key, value] of Object.entries(node)) {
          if (SKIP_KEYS.has(key) || !value || typeof value !== 'object') continue;
          for (const child of Array.isArray(value) ? value : [value]) {
            if (child && typeof child.type === 'string') stack.push(child);
          }
        }
      }
      return null;
    }

    return {
      CallExpression(node) {
        const hook = hookName(node.callee);
        if (!hook || !EFFECT_HOOKS.has(hook)) return;
        let effect = node.arguments[0];
        let via = null;
        if (effect?.type === 'Identifier') {
          via = effect.name;
          effect = resolveFunction(effect);
        }
        if (!effect?.body) return;
        const found = findRequest(effect.body, new Set([effect]));
        if (!found) return;
        const through = found.via ?? via;
        context.report({
          node: found.node,
          messageId: 'fetchInEffect',
          data: { call: found.call, hook, via: through ? ` (via \`${through}\`)` : '' },
        });
      },
    };
  },
};
