import { findAttr, hasSpread, jsxName, meaningfulChildren, staticAttrValue } from '../lib/jsx.js';

function providesText(element) {
  return meaningfulChildren(element).some((child) =>
    child.type !== 'JSXElement' || meaningfulChildren(child).length > 0,
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Icon-only buttons must have `aria-label` describing the action.',
      source: 'AGENTS.md > Icons; skills/skateboard/rules/icons.md > Icon-Only Buttons',
    },
    schema: [],
    messages: {
      missingLabel:
        'Found an icon-only `<Button>` without `aria-label`. Why: the icon has no text, so screen readers announce just "button" and voice-control users cannot name it. ' +
        'Fix: add an action label, e.g. `<Button variant="ghost" size="icon" aria-label="Delete item"><Trash2 size={18} aria-hidden="true" /></Button>` (describe the action, not the glyph: "Close dialog", not "X").',
    },
  },
  create(context) {
    return {
      JSXElement(element) {
        const node = element.openingElement;
        if (jsxName(node.name) !== 'Button' || hasSpread(node) || findAttr(node, 'asChild')) return;
        if (findAttr(node, 'aria-label') || findAttr(node, 'aria-labelledby')) return;
        const size = staticAttrValue(findAttr(node, 'size'));
        const isIconSized = typeof size === 'string' && size.startsWith('icon');
        const hasChildren = meaningfulChildren(element).length > 0;
        if ((isIconSized || hasChildren) && !providesText(element)) {
          context.report({ node, messageId: 'missingLabel' });
        }
      },
    };
  },
};
