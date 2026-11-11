import { classGroupVisitors } from '../lib/classStrings.js';

const MOTION_VARIANTS = new Set(['motion-safe', 'motion-reduce']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Honor `prefers-reduced-motion`: wrap animations in `motion-safe:` or use `@media (prefers-reduced-motion: reduce)`.',
      source: 'AGENTS.md > Accessibility > Color, Contrast & Touch; skills/skateboard/rules/guidelines.md #18',
    },
    schema: [],
    messages: {
      motion:
        'Found the animation "{{token}}" without a reduced-motion guard. Why: users who set "reduce motion" (vestibular disorders, motion sickness) still get the animation. ' +
        'Fix: write "motion-safe:{{utility}}", or keep it and add "motion-reduce:animate-none" to the same class list.',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      const hasReduceOff = tokens.some((t) => t.utility === 'animate-none' && t.variants.includes('motion-reduce'));
      if (hasReduceOff) return;
      for (const t of tokens) {
        if (!t.utility.startsWith('animate-') || t.utility === 'animate-none') continue;
        if (t.variants.some((v) => MOTION_VARIANTS.has(v))) continue;
        context.report({ node: t.node, messageId: 'motion', data: { token: t.raw, utility: t.utility } });
      }
    });
  },
};
