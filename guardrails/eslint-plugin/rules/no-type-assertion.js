/**
 * True for `as const` / `<const>x`, which narrows a literal instead of overriding a type.
 *
 * @param {any} typeAnnotation - Assertion target type
 * @returns {boolean} Whether this is a const assertion
 */
function isConstAssertion(typeAnnotation) {
  return (
    typeAnnotation.type === 'TSTypeReference' &&
    typeAnnotation.typeName.type === 'Identifier' &&
    typeAnnotation.typeName.name === 'const'
  );
}

/**
 * True when the asserted expression is untrusted input: `JSON.parse(...)`,
 * `await res.json()`, `res.json()`, or `apiRequest(...)`.
 *
 * @param {any} expr - Expression being asserted
 * @returns {boolean} Whether the value crosses a system boundary
 */
function isBoundaryValue(expr) {
  const inner = expr.type === 'AwaitExpression' ? expr.argument : expr;
  if (inner.type !== 'CallExpression') return false;
  const { callee } = inner;
  if (callee.type === 'Identifier') return ['apiRequest', 'apiRequestWithParams', 'fetch'].includes(callee.name);
  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return false;
  const isJsonParse = callee.object.type === 'Identifier' && callee.object.name === 'JSON' && callee.property.name === 'parse';
  return isJsonParse || callee.property.name === 'json';
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never use `as` casts to silence errors (especially `as unknown as X`); never cast unvalidated data at boundaries (`JSON.parse(x) as User`). `as const` is allowed.',
      source: 'AGENTS.md > TypeScript Anti-Patterns',
    },
    schema: [],
    messages: {
      cast:
        'Found a type assertion to `{{type}}`. Why: `as` tells the compiler to trust you instead of checking, so a wrong guess compiles and breaks at runtime. ' +
        'Fix: prove the type instead: annotate the declaration (`const x: T = ...`), use `satisfies T` to check a literal, narrow with a type guard (`typeof`, `in`, `instanceof`, `Array.isArray`), or fix the upstream type.',
      doubleCast:
        'Found a double cast `as unknown as {{type}}`. Why: casting through `unknown` throws away every type check between two unrelated types; it is always hiding a real mismatch. ' +
        'Fix: write a function that converts or validates the value (`function toUser(v: unknown): User { ... }`) and return the proven type from it.',
      boundary:
        'Found unvalidated boundary data cast to `{{type}}`. Why: JSON and network responses are `unknown` at runtime; `JSON.parse(x) as T` lets malformed input flow through the app as if it were checked. ' +
        'Fix: parse to `unknown` and validate with a guard before use, as scripts/verify-ui-version.ts does in `readManifest` (`const parsed: unknown = JSON.parse(...); if (typeof parsed !== "object" || parsed === null) throw ...`). ' +
        'For skateboard-ui requests pass the generic instead: `apiRequest<Deal[]>("/deals")`, `useListData<Deal>("/deals")`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * Report one assertion node with the most specific message.
     *
     * @param {any} node - TSAsExpression or TSTypeAssertion
     */
    function check(node) {
      if (isConstAssertion(node.typeAnnotation)) return;
      // The outer `as X` of `as unknown as X` reports once, as a double cast.
      if (node.parent.type === 'TSAsExpression' && node.typeAnnotation.type === 'TSUnknownKeyword') return;
      const type = sourceCode.getText(node.typeAnnotation);
      const inner = node.expression;
      if ((inner.type === 'TSAsExpression' || inner.type === 'TSTypeAssertion') && inner.typeAnnotation.type === 'TSUnknownKeyword') {
        context.report({ node, messageId: 'doubleCast', data: { type } });
      } else if (isBoundaryValue(inner)) {
        context.report({ node, messageId: 'boundary', data: { type } });
      } else {
        context.report({ node, messageId: 'cast', data: { type } });
      }
    }

    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};
