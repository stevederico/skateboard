import { classGroupVisitors } from '../lib/classStrings.js';

const SPACE_RE = /^-?space-([xy])-/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use `gap-*` between flex/grid children: never `space-x-*` / `space-y-*`.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Spacing Rules',
    },
    schema: [],
    messages: {
      space:
        'Found "{{token}}". Why: space-* adds margins to children, which breaks with conditional/hidden children, wrapping, and RTL, and mixes two spacing systems in one codebase. ' +
        'Fix: make the parent a flex or grid container and use gap: "{{fix}}".',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      for (const t of tokens) {
        const match = SPACE_RE.exec(t.utility);
        if (!match) continue;
        const size = t.utility.replace(SPACE_RE, '');
        const fix = size === 'reverse'
          ? `flex ${match[1] === 'x' ? 'flex-row-reverse' : 'flex-col-reverse'} gap-N`
          : `flex ${match[1] === 'y' ? 'flex-col ' : ''}gap-${size}`;
        context.report({ node: t.node, messageId: 'space', data: { token: t.raw, fix } });
      }
    });
  },
};
