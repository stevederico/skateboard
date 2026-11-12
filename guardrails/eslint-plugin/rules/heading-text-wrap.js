import { collectStrings, tokenize } from '../lib/classStrings.js';
import { findAttr, hasSpread, jsxName } from '../lib/jsx.js';

const HEADING = /^h[1-6]$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use `text-balance` or `text-pretty` on headings and titles.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Typography',
    },
    schema: [],
    messages: {
      noWrap:
        'Found `<{{tag}}>` without `text-balance` or `text-pretty`. Why: default wrapping leaves single orphaned words on the last line of headings, which looks broken on narrow screens. ' +
        'Fix: add `text-balance` to headings (`<{{tag}} className="text-heading-lg text-balance">`) or `text-pretty` for longer titles.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = jsxName(node.name);
        if (!HEADING.test(tag) || hasSpread(node)) return;
        const attr = findAttr(node, 'className');
        const tokens = attr?.value ? tokenize(collectStrings(attr.value, new Set())) : [];
        if (tokens.some((t) => t.utility === 'text-balance' || t.utility === 'text-pretty')) return;
        context.report({ node, messageId: 'noWrap', data: { tag } });
      },
    };
  },
};
