/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Always use ES modules: never use `require()`.',
      source: 'AGENTS.md > TypeScript Style / Prohibited Tools & Practices',
    },
    schema: [],
    messages: {
      require:
        'Found `require({{source}})`. Why: the repo is ESM-only (`"type": "module"`); `require` is undefined at runtime in .js/.ts modules and Vite cannot tree-shake or analyze it. ' +
        'Fix: use a static `import x from {{source}};` at the top of the file, or `await import({{source}})` when the load must be lazy.',
      moduleExports:
        'Found a CommonJS export (`{{text}}`). Why: the repo is ESM-only; CommonJS exports are invisible to `import` in this package and break typechecking. ' +
        'Fix: use `export function name() {}` / `export const name = ...` or `export default ...`.',
      importEquals:
        'Found `import x = require(...)`. Why: it is TypeScript\'s CommonJS interop syntax and emits `require()`, which does not exist in this ESM-only repo. ' +
        'Fix: write `import x from "..."` (or `import * as x from "..."`).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * True for `module.exports` or `exports.x` member expressions.
     *
     * @param {any} node - MemberExpression
     * @returns {boolean} Whether it is a CommonJS export target
     */
    function isCommonJsExport(node) {
      if (node.type !== 'MemberExpression') return false;
      const { object, property } = node;
      if (object.type === 'Identifier' && object.name === 'module' && property.type === 'Identifier' && property.name === 'exports') return true;
      if (object.type === 'Identifier' && object.name === 'exports') return true;
      return isCommonJsExport(object);
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        const isRequire = callee.type === 'Identifier' && callee.name === 'require';
        const isResolve = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'require';
        if (!isRequire && !isResolve) return;
        const source = node.arguments[0] ? sourceCode.getText(node.arguments[0]) : "'...'";
        context.report({ node, messageId: 'require', data: { source } });
      },
      AssignmentExpression(node) {
        if (isCommonJsExport(node.left)) {
          context.report({ node, messageId: 'moduleExports', data: { text: sourceCode.getText(node.left) } });
        }
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference') context.report({ node, messageId: 'importEquals' });
      },
    };
  },
};
