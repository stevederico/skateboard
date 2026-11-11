import { classGroupVisitors } from '../lib/classStrings.js';

const REMOVES_OUTLINE = new Set(['outline-none', 'outline-hidden', 'outline-0']);
const FOCUS_VARIANTS = new Set(['focus-visible', 'focus', 'focus-within']);

/**
 * True when the token draws a visible focus indicator (`focus-visible:ring-2`,
 * `focus:outline-2`, `focus-visible:border-ring`, `focus-visible:shadow-...`).
 *
 * @param {import('../lib/classStrings.js').ClassToken} t - Class token
 * @returns {boolean} Whether the token is a focus replacement
 */
function isFocusReplacement(t) {
  if (!t.variants.some((v) => FOCUS_VARIANTS.has(v))) return false;
  if (REMOVES_OUTLINE.has(t.utility)) return false;
  return /^(ring|outline|border|shadow)(-|$)/.test(t.utility);
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Visible focus indicators must never be removed (`outline-none` without a replacement is prohibited).',
      source: 'AGENTS.md > Accessibility > Keyboard Navigation; skills/skateboard/rules/guidelines.md #25',
    },
    schema: [],
    messages: {
      outline:
        'Found "{{token}}" with no focus replacement in the same class list. Why: keyboard users lose track of where focus is, which fails WCAG 2.4.7 (focus visible). ' +
        'Fix: add a visible focus style next to it, e.g. "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", or drop "{{token}}" and keep the default outline. skateboard-ui Button/Input already ship focus rings, so prefer them over restyled raw elements.',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      if (tokens.some(isFocusReplacement)) return;
      for (const t of tokens) {
        if (REMOVES_OUTLINE.has(t.utility)) context.report({ node: t.node, messageId: 'outline', data: { token: t.raw } });
      }
    });
  },
};
