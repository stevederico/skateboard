import { TEST_FILE } from '../lib/paths.js';

const FUNCTION_LIKE = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'ClassExpression']);
const DECLARATIONS = new Set(['FunctionDeclaration', 'ClassDeclaration']);

/**
 * True when a `/** *\/` block comment sits directly before the node.
 *
 * @param {import('eslint').SourceCode} sourceCode - Source code
 * @param {any} node - Statement to check
 * @returns {boolean} Whether a JSDoc block precedes it
 */
function hasJsdoc(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  const last = comments[comments.length - 1];
  return Boolean(last && last.type === 'Block' && last.value.startsWith('*'));
}

/**
 * Find the top-level statement that declares `name` as a function or class, so
 * `export { name }` can be checked where the function is written.
 *
 * @param {any} program - Program node
 * @param {string} name - Local binding name
 * @returns {any} Declaring statement, or null when it is not a function/class
 */
function findLocalDeclaration(program, name) {
  for (const stmt of program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration' ? stmt.declaration : stmt;
    if (!decl) continue;
    if (DECLARATIONS.has(decl.type) && decl.id?.name === name) return decl === stmt ? stmt : null;
    if (decl.type === 'VariableDeclaration' && decl === stmt) {
      const found = decl.declarations.find((d) => d.id.type === 'Identifier' && d.id.name === name);
      if (found) return found.init && FUNCTION_LIKE.has(found.init.type) ? stmt : null;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'All exported/public functions, classes, and non-obvious constants must have JSDoc comments (`/** */`).',
      source: 'AGENTS.md > Documentation Requirements',
    },
    schema: [],
    messages: {
      missing:
        'Found the exported {{kind}} "{{name}}" with no JSDoc block. Why: exports are the API other files (and agents) call without reading the body; documentation must match code, and a missing contract is how wrong usage spreads. ' +
        'Fix: add a `/** ... */` block directly above it with a one-line summary, `@param name - meaning` for each parameter, `@returns` for the result, and `@throws` if it can throw.',
    },
  },
  create(context) {
    if (TEST_FILE.test(context.filename)) return {};
    const { sourceCode } = context;
    const report = (node, kind, name) => {
      if (!hasJsdoc(sourceCode, node)) context.report({ node, messageId: 'missing', data: { kind, name } });
    };
    const kindOf = (type) => (type.startsWith('Class') ? 'class' : 'function');
    let program = null;
    return {
      Program(node) {
        program = node;
      },
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (decl && DECLARATIONS.has(decl.type)) {
          if (!hasJsdoc(sourceCode, decl)) report(node, kindOf(decl.type), decl.id.name);
        } else if (decl?.type === 'VariableDeclaration') {
          const fn = decl.declarations.find((d) => d.init && FUNCTION_LIKE.has(d.init.type));
          if (fn) report(node, kindOf(fn.init.type), fn.id.name ?? 'export');
        } else if (!decl && !node.source) {
          for (const spec of node.specifiers) {
            const target = findLocalDeclaration(program, spec.local.name);
            if (target) report(target, 'function', spec.local.name);
          }
        }
      },
      ExportDefaultDeclaration(node) {
        const decl = node.declaration;
        if (DECLARATIONS.has(decl.type) || FUNCTION_LIKE.has(decl.type)) {
          if (!hasJsdoc(sourceCode, decl)) report(node, kindOf(decl.type), decl.id?.name ?? 'default');
        } else if (decl.type === 'Identifier') {
          const target = findLocalDeclaration(program, decl.name);
          if (target) report(target, 'function', decl.name);
        }
      },
    };
  },
};
