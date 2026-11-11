/**
 * True when a variable is a function defined in this file: a function declaration, or a
 * `const` initialized with an arrow/function expression or `useCallback(...)`. Props,
 * parameters, imports and hook results (`const [open, setOpen] = useState()`) are not.
 *
 * @param {any} variable - eslint-scope Variable
 * @returns {boolean} Whether it is a locally defined function
 */
function isLocalFunction(variable) {
  const def = variable?.defs[0];
  if (!def) return false;
  if (def.type === 'FunctionName') return true;
  if (def.type !== 'Variable' || def.node.id.type !== 'Identifier') return false;
  const init = def.node.init;
  if (!init) return false;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return true;
  return init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'useCallback';
}

/**
 * Look up an identifier through the enclosing scopes.
 *
 * @param {any} scope - Starting scope
 * @param {string} name - Identifier name
 * @returns {any} eslint-scope Variable, or undefined
 */
function findVariable(scope, name) {
  for (let s = scope; s; s = s.upper) {
    const found = s.set.get(name);
    if (found) return found;
  }
  return undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Event handlers prefixed with `handle` (`handleSubmit`, `handleDelete`).',
      source: 'AGENTS.md > React Rules',
    },
    schema: [],
    messages: {
      handlerName:
        'Found `{{prop}}={{{name}}}` where `{{name}}` is a function defined in this file without the `handle` prefix. Why: the prefix tells readers (and agents) at a glance which functions are UI event handlers versus data helpers, so side effects are easy to find. ' +
        'Fix: rename it to `{{suggestion}}` (and update its callers); props passed through from a parent keep their `on*` name.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!/^on[A-Z]/.test(node.name.name ?? '')) return;
        const expr = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : null;
        if (expr?.type !== 'Identifier' || expr.name.startsWith('handle')) return;
        const variable = findVariable(context.sourceCode.getScope(node), expr.name);
        if (!isLocalFunction(variable)) return;
        const base = expr.name.replace(/^on(?=[A-Z])/, '');
        const suggestion = `handle${base.charAt(0).toUpperCase()}${base.slice(1)}`;
        context.report({ node: expr, messageId: 'handlerName', data: { prop: node.name.name, name: expr.name, suggestion } });
      },
    };
  },
};
