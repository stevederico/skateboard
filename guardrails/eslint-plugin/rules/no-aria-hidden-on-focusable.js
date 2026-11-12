import { findAttr, jsxName, staticAttrValue } from '../lib/jsx.js';

/** Elements that are focusable by default. */
const FOCUSABLE_TAGS = new Set(['button', 'input', 'select', 'textarea', 'iframe', 'summary']);

/** skateboard-ui components that render a focusable control. */
const FOCUSABLE_COMPONENTS = new Set([
  'Button', 'Input', 'Textarea', 'Switch', 'Checkbox', 'SelectTrigger', 'Link',
  'DialogTrigger', 'SheetTrigger', 'PopoverTrigger', 'DropdownMenuTrigger', 'TooltipTrigger',
]);

/**
 * True when the element can receive keyboard focus.
 *
 * @param {any} node - JSXOpeningElement
 * @returns {boolean} Whether it is focusable
 */
function isFocusable(node) {
  const name = jsxName(node.name);
  if (FOCUSABLE_TAGS.has(name) || FOCUSABLE_COMPONENTS.has(name)) {
    return staticAttrValue(findAttr(node, 'type')) !== 'hidden';
  }
  if (name === 'a' && findAttr(node, 'href')) return true;
  const tabIndex = findAttr(node, 'tabIndex');
  if (!tabIndex) return false;
  const value = staticAttrValue(tabIndex);
  return value === undefined || Number(value) >= 0;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use `aria-hidden="true"` on focusable elements.',
      source: 'AGENTS.md > Accessibility > ARIA Attributes',
    },
    schema: [],
    messages: {
      hiddenFocusable:
        'Found `aria-hidden` on a focusable `<{{name}}>`. Why: keyboard users can still tab to it, but screen readers announce nothing, so focus lands on an invisible, unnamed control. ' +
        'Fix: move `aria-hidden="true"` onto the decorative child (e.g. the icon: `<Plus size={18} aria-hidden="true" />`) and give the control a name (`aria-label` or visible text); if it really must be hidden, also remove it from the tab order (`tabIndex={-1}`, or `disabled`).',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const hidden = findAttr(node, 'aria-hidden');
        if (!hidden) return;
        const value = staticAttrValue(hidden);
        if (value === false || value === 'false') return;
        if (isFocusable(node)) context.report({ node: hidden, messageId: 'hiddenFocusable', data: { name: jsxName(node.name) } });
      },
    };
  },
};
