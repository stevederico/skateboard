import { classGroupVisitors } from '../lib/classStrings.js';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use `size-*` for square elements: never `w-10 h-10` when `size-10` works.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Layout Rules',
    },
    schema: [],
    messages: {
      size:
        'Found "{{width}}" and "{{height}}" in the same class list. Why: two utilities for one square size drift apart when one is edited, and the repo standard is the single size utility. ' +
        'Fix: replace both with "{{replacement}}".',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      /** @type {Map<string, import('../lib/classStrings.js').ClassToken>} */
      const widths = new Map();
      for (const t of tokens) {
        if (t.utility.startsWith('w-')) widths.set(`${t.variants.join(':')}|${t.utility.slice(2)}`, t);
      }
      for (const t of tokens) {
        if (!t.utility.startsWith('h-')) continue;
        const key = `${t.variants.join(':')}|${t.utility.slice(2)}`;
        const width = widths.get(key);
        if (!width) continue;
        const prefix = t.variants.length ? `${t.variants.join(':')}:` : '';
        context.report({
          node: t.node,
          messageId: 'size',
          data: { width: width.raw, height: t.raw, replacement: `${prefix}size-${t.utility.slice(2)}` },
        });
        widths.delete(key);
      }
    });
  },
};
