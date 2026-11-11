/**
 * @typedef {(node: import('estree').Node, source: string) => void} SourceCallback
 */

/**
 * Read a static string out of a specifier node (`'x'` or a template with no expressions).
 *
 * @param {any} node - Specifier AST node
 * @returns {string | null} The specifier, or null when it is computed at runtime
 */
function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/**
 * Build visitors that report every static module specifier in a file: `import`,
 * `export ... from`, dynamic `import()`, `require()`, TS `import x = require()`, and
 * `import('x').Type` type queries. One helper keeps every import-based rule consistent,
 * so a ban cannot be dodged by switching import syntax.
 *
 * @param {SourceCallback} onSource - Called with the specifier node and its string value
 * @returns {import('eslint').Rule.RuleListener} ESLint visitors
 */
export function moduleSourceVisitors(onSource) {
  const check = (node) => {
    const value = staticString(node);
    if (value !== null) onSource(node, value);
  };
  return {
    ImportDeclaration: (node) => check(node.source),
    ExportNamedDeclaration: (node) => check(node.source),
    ExportAllDeclaration: (node) => check(node.source),
    ImportExpression: (node) => check(node.source),
    CallExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0]);
    },
    TSImportEqualsDeclaration(node) {
      if (node.moduleReference.type === 'TSExternalModuleReference') check(node.moduleReference.expression);
    },
    TSImportType(node) {
      const arg = node.argument;
      check(arg?.type === 'TSLiteralType' ? arg.literal : arg);
    },
  };
}

/**
 * Package name of a bare specifier (`@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`).
 *
 * @param {string} source - Import specifier
 * @returns {string} Package name (the specifier itself for relative paths)
 */
export function packageName(source) {
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Merge several visitor objects so two helpers can listen to the same node type.
 *
 * @param {...import('eslint').Rule.RuleListener} listeners - Visitor objects
 * @returns {import('eslint').Rule.RuleListener} Combined visitors
 */
export function mergeVisitors(...listeners) {
  /** @type {Record<string, Array<(node: any) => void>>} */
  const byType = {};
  for (const listener of listeners) {
    for (const [type, fn] of Object.entries(listener)) {
      if (typeof fn === 'function') (byType[type] ??= []).push(fn);
    }
  }
  return Object.fromEntries(
    Object.entries(byType).map(([type, fns]) => [type, (node) => fns.forEach((fn) => fn(node))]),
  );
}
