/** Helpers whose string arguments are Tailwind class lists. */
export const CLASS_FUNCTIONS = new Set(['cn', 'clsx', 'cx', 'cva', 'twMerge', 'classNames', 'tv']);

/** JSX attributes whose values are Tailwind class lists. */
export const CLASS_ATTRIBUTES = new Set(['className', 'class']);

/**
 * @typedef {object} ClassToken
 * @property {any} node - AST node holding the token (report target)
 * @property {string} raw - Token as written, e.g. `dark:hover:bg-white/50`
 * @property {string[]} variants - Variant prefixes, e.g. `['dark', 'hover']`
 * @property {string} utility - Utility without variants or `!`, e.g. `bg-white/50`
 */

/**
 * Split a class token into variants and utility. Colons inside `[...]` / `(...)`
 * (arbitrary values and variants such as `[&>svg]:size-3`) are not separators.
 *
 * @param {string} raw - Single class token
 * @returns {{ variants: string[], utility: string }} Parsed token
 */
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

/**
 * Collect every string fragment reachable from a class expression: literals, template
 * quasis, both branches of ternaries, `&&` right-hand sides, arrays, object keys (the
 * `cn({ 'bg-x': cond })` form), cva variant values, and nested class-helper calls.
 *
 * @param {any} node - Expression node
 * @param {Set<any>} seenCalls - Class-helper calls already scanned (avoids double reports)
 * @param {Array<{ node: any, value: string }>} out - Accumulator
 * @returns {Array<{ node: any, value: string }>} String fragments with their nodes
 */
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

/**
 * Split fragments into tokens.
 *
 * @param {Array<{ node: any, value: string }>} fragments - String fragments
 * @returns {ClassToken[]} Parsed tokens
 */
export function tokenize(fragments) {
  return fragments.flatMap(({ node, value }) =>
    value.split(/\s+/).filter(Boolean).map((raw) => ({ node, raw, ...parseToken(raw) })),
  );
}

/**
 * Build visitors that hand each class "group" (one `className` attribute or one
 * top-level `cn()`/`cva()` call) to `onGroup` as parsed tokens. Groups matter for
 * rules that need context, e.g. `outline-none` is fine when the same group adds a
 * `focus-visible:ring-*` replacement.
 *
 * @param {(tokens: ClassToken[], groupNode: any) => void} onGroup - Group handler
 * @returns {import('eslint').Rule.RuleListener} ESLint visitors
 */
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
