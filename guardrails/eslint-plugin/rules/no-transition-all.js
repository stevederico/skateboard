import { classGroupVisitors } from '../lib/classStrings.js';

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use `transition-all`: be specific (`transition-colors`, `transition-opacity`, `transition-transform`).',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Layout Rules',
    },
    schema: [],
    messages: {
      all:
        'Found "{{token}}". Why: transition-all animates every property that changes, including layout (width, height, padding), which causes jank and surprise animations when unrelated classes toggle. ' +
        'Fix: name the property that should animate: transition-colors (hover/background), transition-opacity (fade), transition-transform (scale/translate), or transition-shadow.',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      for (const t of tokens) {
        if (t.utility === 'transition-all' || t.utility === 'transition-[all]') {
          context.report({ node: t.node, messageId: 'all', data: { token: t.raw } });
        }
      }
    });
  },
};
