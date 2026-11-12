import { jsxName } from '../lib/jsx.js';

const LOADING_TEXT = /^\s*loading\b/i;

/**
 * True when a string expression is rendered as a JSX child (directly or as a branch of
 * `cond ? a : b` / `cond && a`), not used as a comparison operand or argument.
 *
 * @param {any} node - Literal or TemplateLiteral
 * @returns {boolean} Whether the string is rendered
 */
function isRenderedChild(node) {
  let current = node;
  while (
    (current.parent.type === 'ConditionalExpression' && current.parent.test !== current) ||
    (current.parent.type === 'LogicalExpression' && current.parent.right === current)
  ) current = current.parent;
  return current.parent.type === 'JSXExpressionContainer' && current.parent.parent.type === 'JSXElement';
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Show `<Spinner>` inside button during loading: never replace button text with "Loading...".',
      source: 'skills/skateboard/rules/forms.md > Form Layout',
    },
    schema: [],
    messages: {
      loadingText:
        'Found "{{text}}" rendered inside a `<Button>`. Why: swapping the label changes the button width (layout shift) and screen readers lose the action name mid-submit. ' +
        'Fix: keep the label and show a spinner: `<Button type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner className="size-4" /> : "Save"}</Button>` (Spinner from `@stevederico/skateboard-ui/shadcn/ui/spinner`), or render `<Spinner />` next to the label.',
    },
  },
  create(context) {
    /**
     * Report a loading string when it sits inside a Button element.
     *
     * @param {any} node - Literal or JSXText node
     * @param {string} text - Its text
     */
    function check(node, text) {
      if (!LOADING_TEXT.test(text)) return;
      const ancestors = context.sourceCode.getAncestors(node);
      // Attribute values (aria-label="Loading") are not rendered text.
      if (ancestors.some((a) => a.type === 'JSXAttribute')) return;
      const inButton = ancestors.some((a) => a.type === 'JSXElement' && jsxName(a.openingElement.name) === 'Button');
      if (inButton) context.report({ node, messageId: 'loadingText', data: { text: text.trim() } });
    }
    return {
      JSXText: (node) => check(node, node.value),
      Literal(node) {
        if (typeof node.value === 'string' && isRenderedChild(node)) check(node, node.value);
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && isRenderedChild(node)) check(node, node.quasis[0].value.cooked ?? '');
      },
    };
  },
};
