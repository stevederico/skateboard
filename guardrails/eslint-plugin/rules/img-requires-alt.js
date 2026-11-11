import { findAttr, hasSpread, jsxName } from '../lib/jsx.js';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'All images must have meaningful `alt` text; use `alt=""` only for purely decorative images.',
      source: 'AGENTS.md > Accessibility > Required on Every Element',
    },
    schema: [],
    messages: {
      missingAlt:
        'Found an `<img>` without an `alt` attribute. Why: screen readers announce the file name (or nothing) instead of the content, and a broken image shows no fallback text. ' +
        'Fix: add `alt="what the image shows"` (e.g. `alt="Acme logo"`), or `alt=""` when the image is purely decorative.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (jsxName(node.name) !== 'img' || hasSpread(node) || findAttr(node, 'alt')) return;
        context.report({ node, messageId: 'missingAlt' });
      },
    };
  },
};
