/**
 * True for a callback that does nothing: `() => {}`, `function () {}`, `() => undefined`,
 * `() => null`.
 *
 * @param {any} fn - Candidate callback
 * @returns {boolean} Whether the callback swallows its argument
 */
function isNoopCallback(fn) {
  if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return false;
  if (fn.body.type === 'BlockStatement') return fn.body.body.length === 0;
  const { body } = fn;
  return (body.type === 'Identifier' && body.name === 'undefined') || (body.type === 'Literal' && body.value === null);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never silently swallow errors (at minimum `console.error`); every error must be visible to the user.',
      source: 'AGENTS.md > Error Handling (MANDATORY)',
    },
    schema: [],
    messages: {
      emptyCatch:
        'Found an empty catch block. Why: the error disappears, so the UI stays in a loading or half-updated state and nobody can debug it. ' +
        'Fix: handle it: `console.error(err)` at minimum, plus `toast.error("Could not save. Try again.")` for transient failures in the UI, an error state for failed fetches, or rethrow with context (`throw new Error("loading config failed", { cause: err })`).',
      noopCatch:
        'Found `.catch()` with a no-op handler. Why: it marks the promise as handled while throwing the error away, so failures are invisible. ' +
        'Fix: use `try { await p; } catch (err) { console.error(err); toast.error("...") }`, or pass a handler that logs and surfaces the error.',
    },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (node.body.body.length === 0) context.report({ node, messageId: 'emptyCatch' });
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || callee.property.name !== 'catch') return;
        if (isNoopCallback(node.arguments[0])) context.report({ node: node.arguments[0], messageId: 'noopCatch' });
      },
    };
  },
};
