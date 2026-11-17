export const CLASS_FUNCTIONS = new Set(['cn', 'clsx', 'cx', 'cva', 'twMerge', 'classNames', 'tv']);

export const CLASS_ATTRIBUTES = new Set(['className', 'class']);

export function parseToken(raw) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === '[' || ch === '(') depth += 1;
    if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  const utility = current.replace(/^!|!$/g, '');
  return { variants: parts, utility };
}

export function collectStrings(node, seenCalls, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') out.push({ node, value: node.value });
      break;
    case 'TemplateLiteral':
      node.quasis.forEach((q) => out.push({ node, value: q.value.cooked ?? q.value.raw }));
      node.expressions.forEach((e) => collectStrings(e, seenCalls, out));
      break;
    case 'JSXExpressionContainer':
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
      collectStrings(node.expression, seenCalls, out);
      break;
    case 'ConditionalExpression':
      collectStrings(node.consequent, seenCalls, out);
      collectStrings(node.alternate, seenCalls, out);
      break;
    case 'LogicalExpression':
      if (node.operator !== '&&') collectStrings(node.left, seenCalls, out);
      collectStrings(node.right, seenCalls, out);
      break;
    case 'BinaryExpression':
      if (node.operator === '+') {
        collectStrings(node.left, seenCalls, out);
        collectStrings(node.right, seenCalls, out);
      }
      break;
    case 'ArrayExpression':
      node.elements.forEach((e) => collectStrings(e, seenCalls, out));
      break;
    case 'ObjectExpression':
      for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        if (prop.key.type === 'Literal') collectStrings(prop.key, seenCalls, out);
        collectStrings(prop.value, seenCalls, out);
      }
      break;
    case 'CallExpression':
      if (node.callee.type === 'Identifier' && CLASS_FUNCTIONS.has(node.callee.name)) {
        seenCalls.add(node);
        node.arguments.forEach((a) => collectStrings(a, seenCalls, out));
      }
      break;
    default:
      break;
  }
  return out;
}

export function tokenize(fragments) {
  return fragments.flatMap(({ node, value }) =>
    value.split(/\s+/).filter(Boolean).map((raw) => ({ node, raw, ...parseToken(raw) })),
  );
}

export function classGroupVisitors(onGroup) {
  const seenCalls = new Set();
  return {
    JSXAttribute(node) {
      if (!CLASS_ATTRIBUTES.has(node.name.name) || !node.value) return;
      onGroup(tokenize(collectStrings(node.value, seenCalls)), node);
    },
    CallExpression(node) {
      if (seenCalls.has(node)) return;
      if (node.callee.type !== 'Identifier' || !CLASS_FUNCTIONS.has(node.callee.name)) return;
      onGroup(tokenize(collectStrings(node, seenCalls)), node);
    },
  };
}
