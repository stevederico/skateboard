/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `async`/`await` over `.then()` chains.',
      source: 'AGENTS.md > TypeScript Style',
    },
    schema: [],
    messages: {
      then:
        'Found a `.then()` call. Why: promise chains split control flow across callbacks, make early returns and try/catch error handling awkward, and are where unhandled rejections hide. ' +
        'Fix: make the enclosing function `async` and write `const value = await promise;` inside `try { ... } catch (err) { ... }`. For a lazy module use `loadX: () => import("./x.json")` (return the promise) instead of chaining.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'then') {
          context.report({ node: callee.property, messageId: 'then' });
        }
      },
    };
  },
};
