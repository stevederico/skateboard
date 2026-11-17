export function jsxName(name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return `${jsxName(name.object)}.${name.property.name}`;
  if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
  return '';
}

export function findAttr(opening, attrName) {
  return opening.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === attrName);
}

export function hasSpread(opening) {
  return opening.attributes.some((a) => a.type === 'JSXSpreadAttribute');
}

export function staticAttrValue(attr) {
  if (!attr) return undefined;
  if (attr.value === null) return true;
  if (attr.value.type === 'Literal') return attr.value.value;
  if (attr.value.type === 'JSXExpressionContainer') {
    const expr = attr.value.expression;
    if (expr.type === 'Literal') return expr.value;
    if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) return expr.quasis[0].value.cooked;
    if (expr.type === 'UnaryExpression' && expr.operator === '-' && expr.argument.type === 'Literal') return -expr.argument.value;
  }
  return undefined;
}

export const isIntrinsic = (name) => /^[a-z]/.test(name);

export function meaningfulChildren(element) {
  return element.children.filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''));
}

export function walkJsx(element, visit) {
  const stack = [...(element.children ?? [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'JSXElement') {
      visit(node);
      stack.push(...node.children);
      for (const attr of node.openingElement.attributes) if (attr.value) stack.push(attr.value);
    } else if (node.type === 'JSXFragment') {
      stack.push(...node.children);
    } else if (node.type === 'JSXExpressionContainer') {
      stack.push(node.expression);
    } else if (node.type === 'ConditionalExpression') {
      stack.push(node.consequent, node.alternate);
    } else if (node.type === 'LogicalExpression') {
      stack.push(node.right);
    } else if (node.type === 'ArrayExpression') {
      stack.push(...node.elements);
    } else if (node.type === 'CallExpression') {
      for (const arg of node.arguments) {
        if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') stack.push(arg.body);
      }
    } else if (node.type === 'BlockStatement') {
      for (const stmt of node.body) if (stmt.type === 'ReturnStatement') stack.push(stmt.argument);
    }
  }
}
