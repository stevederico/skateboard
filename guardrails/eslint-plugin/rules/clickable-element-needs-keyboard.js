import { findAttr, hasSpread, jsxName } from '../lib/jsx.js';

/** Intrinsic elements that are already interactive (or forward clicks, like `<label>`). */
const INTERACTIVE = new Set(['a', 'button', 'input', 'select', 'textarea', 'label', 'summary', 'details', 'option', 'form', 'video', 'audio']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'All custom interactive components (divs/spans acting as buttons) must have `role`, `tabIndex`, and keyboard event handlers.',
      source: 'AGENTS.md > Accessibility > Required on Every Element',
    },
    schema: [],
    messages: {
      notKeyboardReachable:
        'Found `<{{name}} onClick>` missing {{missing}}. Why: a clickable div/span is invisible to the Tab key and screen readers, so keyboard and assistive-tech users cannot activate it. ' +
        'Fix: use `<Button>` from `@stevederico/skateboard-ui/shadcn/ui/button` (`variant="ghost"` keeps it unstyled-looking); if it truly cannot be a button, add `role="button" tabIndex={0} onKeyDown={handleKeyDown}` handling Enter and Space.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        if (!/^[a-z]/.test(name) || INTERACTIVE.has(name) || hasSpread(node) || !findAttr(node, 'onClick')) return;
        const missing = [];
        if (!findAttr(node, 'role')) missing.push('`role`');
        if (!findAttr(node, 'tabIndex')) missing.push('`tabIndex`');
        if (!['onKeyDown', 'onKeyUp', 'onKeyPress'].some((a) => findAttr(node, a))) missing.push('a keyboard handler (`onKeyDown`)');
        if (missing.length) {
          context.report({ node, messageId: 'notKeyboardReachable', data: { name, missing: missing.join(', ') } });
        }
      },
    };
  },
};
