/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use `any`: use `unknown` and narrow with type guards.',
      source: 'AGENTS.md > TypeScript Anti-Patterns',
    },
    schema: [],
    messages: {
      any:
        'Found the `any` type. Why: `any` switches the compiler off for this value and everything it flows into, so a wrong shape compiles and fails at runtime. ' +
        'Fix: type it as `unknown` and narrow with a guard (`typeof x === "string"`, `"id" in x`, `Array.isArray(x)`), or write the real interface. ' +
        'For skateboard-ui generics pass the type: `apiRequest<Deal[]>("/deals")`, `useListData<Deal>("/deals")`.',
    },
  },
  create(context) {
    return {
      TSAnyKeyword(node) {
        context.report({ node, messageId: 'any' });
      },
    };
  },
};
