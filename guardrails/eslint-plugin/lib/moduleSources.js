function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

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

export function packageName(source) {
  const parts = source.split('/');
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

export function mergeVisitors(...listeners) {
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
