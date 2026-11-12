/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use `!` non-null assertions: handle the null/undefined case.',
      source: 'AGENTS.md > TypeScript Anti-Patterns',
    },
    schema: [],
    messages: {
      nonNull:
        'Found a non-null assertion `{{text}}`. Why: `!` deletes `null | undefined` from the type without checking, so the first time the value is missing the app crashes with "cannot read properties of undefined" instead of showing an error state. ' +
        'Fix: handle the missing case: early return (`if (!el) return;`), optional chaining (`user?.email`), a default (`?? []`), or throw a descriptive Error at the boundary.',
    },
  },
  create(context) {
    return {
      TSNonNullExpression(node) {
        context.report({ node, messageId: 'nonNull', data: { text: context.sourceCode.getText(node) } });
      },
    };
  },
};
