import { classGroupVisitors } from '../lib/classStrings.js';

const SIDES = '(?:[xytrblse])?';
const ARBITRARY_RE = new RegExp(
  `^(-?)(p${SIDES}|m${SIDES}|gap(?:-[xy])?|rounded(?:-(?:tl|tr|bl|br|ss|se|es|ee|[trblse]))?)-\\[([^\\]]+)\\]$`,
);

/**
 * Tailwind scale step for a CSS length, when it lands on the 4px grid.
 *
 * @param {string} value - Arbitrary value, e.g. `16px`, `1.5rem`
 * @returns {string | null} Scale step (`4`, `6`, `0.5`) or null
 */
function scaleStep(value) {
  const match = /^(\d*\.?\d+)(px|rem)$/.exec(value);
  if (!match) return null;
  const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
  const step = px / 4;
  return Number.isInteger(step * 2) ? String(step) : null;
}

/**
 * Replacement for an arbitrary spacing/radius token.
 *
 * @param {string} sign - `-` for negative margins, else empty
 * @param {string} utility - Utility name (`p`, `gap-x`, `rounded-t`)
 * @param {string} value - Bracketed value
 * @returns {string} Suggested class
 */
function suggest(sign, utility, value) {
  if (utility.startsWith('rounded')) return `${utility}-md or ${utility}-lg (radius design tokens)`;
  const step = scaleStep(value);
  return step ? `${sign}${utility}-${step}` : `the nearest scale value (${sign}${utility}-2 = 8px, ${sign}${utility}-4 = 16px, ${sign}${utility}-6 = 24px)`;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer Tailwind scale values (`p-4`, `gap-6`): never arbitrary values (`p-[16px]`, `gap-[24px]`); use `rounded-md` / `rounded-lg`, never `rounded-[12px]`.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Spacing Rules',
    },
    schema: [],
    messages: {
      arbitrary:
        'Found the arbitrary value "{{token}}". Why: one-off pixel values break the 4px spacing rhythm and the radius tokens that the --radius design setting drives, so the view stops matching the rest of the app. ' +
        'Fix: use {{suggestion}}.',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      for (const t of tokens) {
        const match = ARBITRARY_RE.exec(t.utility);
        if (!match) continue;
        const suggestion = suggest(match[1], match[2], match[3]);
        context.report({ node: t.node, messageId: 'arbitrary', data: { token: t.raw, suggestion } });
      }
    });
  },
};
