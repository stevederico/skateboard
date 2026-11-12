const TEST_FUNCTIONS = new Set(['describe', 'it', 'test', 'suite']);
const MODIFIERS = new Set(['only', 'skip']);

/**
 * Name of the test function a call targets (`it(...)` → `it`, `it.only(...)` → `it`).
 *
 * @param {any} callee - CallExpression callee
 * @returns {string | null} Test function name, or null
 */
function testFunctionName(callee) {
  if (callee.type === 'Identifier') return TEST_FUNCTIONS.has(callee.name) ? callee.name : null;
  if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
    return TEST_FUNCTIONS.has(callee.object.name) ? callee.object.name : null;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'No `.only` or `.skip` left in test files.',
      source: 'AGENTS.md > Testing Standards > Before Committing',
    },
    schema: [],
    messages: {
      modifier:
        'Found {{name}}.{{modifier}}(). Why: .only silently drops every other test from the run and .skip hides a test forever, so CI goes green without testing the code. ' +
        'Fix: remove ".{{modifier}}" and make the test pass; for a test that only applies in some environments use a computed option, e.g. {{name}}("...", { skip: !IS_TEMPLATE }, fn).',
      option:
        'Found the literal option { {{modifier}}: true } on {{name}}(). Why: a hard-coded {{modifier}} flag drops tests from every run, so CI goes green without testing the code. ' +
        'Fix: delete the option, or make it a real condition, e.g. { skip: !IS_TEMPLATE }.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = testFunctionName(node.callee);
        if (!name) return;
        const { callee } = node;
        if (callee.type === 'MemberExpression' && !callee.computed && MODIFIERS.has(callee.property.name)) {
          context.report({ node: callee.property, messageId: 'modifier', data: { name, modifier: callee.property.name } });
        }
        for (const arg of node.arguments) {
          if (arg.type !== 'ObjectExpression') continue;
          for (const prop of arg.properties) {
            if (prop.type !== 'Property' || prop.key.type !== 'Identifier' || !MODIFIERS.has(prop.key.name)) continue;
            if (prop.value.type === 'Literal' && prop.value.value === true) {
              context.report({ node: prop, messageId: 'option', data: { name, modifier: prop.key.name } });
            }
          }
        }
      },
    };
  },
};
