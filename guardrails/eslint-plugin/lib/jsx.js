/**
 * Name of a JSX element as written (`button`, `Button`, `Card.Header`).
 *
 * @param {any} name - JSXOpeningElement.name
 * @returns {string} Element name
 */
export function jsxName(name) {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return `${jsxName(name.object)}.${name.property.name}`;
  if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
  return '';
}

/**
 * Find a named attribute on a JSX opening element.
 *
 * @param {any} opening - JSXOpeningElement
 * @param {string} attrName - Attribute name (`aria-label`, `className`)
 * @returns {any} The JSXAttribute, or undefined
 */
export function findAttr(opening, attrName) {
  return opening.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === attrName);
}

/**
 * True when the element spreads props (`{...props}`), which may supply any attribute.
 * Rules that check for a missing attribute skip these to avoid false positives.
 *
 * @param {any} opening - JSXOpeningElement
 * @returns {boolean} Whether a spread attribute is present
 */
export function hasSpread(opening) {
  return opening.attributes.some((a) => a.type === 'JSXSpreadAttribute');
}

/**
 * Static value of a JSX attribute: `true` for a bare attribute, the string for
 * `x="a"` / `x={'a'}`, the boolean/number for `x={true}` / `x={0}`, and `undefined`
 * when the value is computed at runtime.
 *
 * @param {any} attr - JSXAttribute (may be undefined)
 * @returns {string | number | boolean | null | undefined} Static value
 */
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

/**
 * True for lowercase intrinsic elements (`div`, `button`), false for components.
 *
 * @param {string} name - Element name
 * @returns {boolean} Whether the element is a DOM tag
 */
export const isIntrinsic = (name) => /^[a-z]/.test(name);

/**
 * Children that carry content (drops whitespace-only text).
 *
 * @param {any} element - JSXElement
 * @returns {any[]} Meaningful children
 */
export function meaningfulChildren(element) {
  return element.children.filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''));
}

/**
 * Walk every JSX element nested under `element` (not including it).
 *
 * @param {any} element - JSXElement or JSXFragment
 * @param {(child: any) => void} visit - Called for each descendant JSXElement
 */
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
      // `items.map((x) => <Row />)`: look into callback bodies that return JSX.
      for (const arg of node.arguments) {
        if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') stack.push(arg.body);
      }
    } else if (node.type === 'BlockStatement') {
      for (const stmt of node.body) if (stmt.type === 'ReturnStatement') stack.push(stmt.argument);
    }
  }
}
