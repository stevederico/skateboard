import { classGroupVisitors } from '../lib/classStrings.js';

/** Utilities that take a color. Longer prefixes first so `ring-offset` wins over `ring`. */
const COLOR_PREFIXES = [
  'ring-offset', 'inset-shadow', 'inset-ring', 'border-x', 'border-y', 'border-t', 'border-r', 'border-b',
  'border-l', 'border-s', 'border-e', 'bg', 'text', 'border', 'ring', 'outline', 'fill', 'stroke', 'from',
  'via', 'to', 'divide', 'decoration', 'shadow', 'accent', 'caret', 'placeholder',
];

/** Tailwind palette hues. Semantic tokens (background, muted-foreground, app, ...) are not in this list. */
const HUES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'mauve', 'olive', 'mist', 'taupe',
];

const PREFIX = `(${COLOR_PREFIXES.join('|')})`;
const PALETTE_RE = new RegExp(`^-?${PREFIX}-(?:(${HUES.join('|')})-\\d{2,3}|(white|black))(?:/\\S+)?$`);
const ARBITRARY_RE = new RegExp(`^-?${PREFIX}-\\[(?:#|rgba?\\(|hsla?\\(|oklch\\(|oklab\\(|lab\\(|lch\\(|color\\()`);
const HEX_RE = /\[[^\]]*#[0-9a-fA-F]{3,8}\b[^\]]*\]/;

/** Hue → semantic token family. */
const HUE_TOKEN = {
  red: 'destructive', rose: 'destructive',
  green: 'success', emerald: 'success', lime: 'success',
  yellow: 'warning', amber: 'warning', orange: 'warning',
  blue: 'info', sky: 'info',
};
const NEUTRALS = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone', 'mauve', 'olive', 'mist', 'taupe']);

/**
 * Suggest the semantic class for a raw color utility.
 *
 * @param {string} prefix - Utility prefix (`bg`, `text`, `border`, ...)
 * @param {string | undefined} hue - Palette hue, if any
 * @param {string | undefined} bw - `white` or `black`, if any
 * @returns {string} Suggested replacement class
 */
function suggest(prefix, hue, bw) {
  const base = prefix.startsWith('border') || prefix === 'divide' ? 'border' : prefix;
  if (bw === 'white') return prefix === 'text' ? 'text-background (or text-primary-foreground on bg-primary)' : `${base}-background`;
  if (bw === 'black') return `${base}-foreground`;
  if (hue && NEUTRALS.has(hue)) {
    if (prefix === 'text') return 'text-muted-foreground';
    if (base === 'border') return 'border-border';
    if (prefix === 'ring' || prefix === 'outline') return `${prefix}-ring`;
    return `${base}-muted (or ${base}-accent)`;
  }
  if (hue && HUE_TOKEN[hue]) return `${base}-${HUE_TOKEN[hue]}`;
  return `${base}-app (brand color, set via --color-app in src/assets/styles.css)`;
}

/**
 * Suggestion for a raw color token, or null when the token is not a raw color.
 *
 * @param {string} utility - Utility without variants
 * @returns {string | null} Replacement suggestion
 */
function rawColorSuggestion(utility) {
  const palette = PALETTE_RE.exec(utility);
  if (palette) return suggest(palette[1], palette[2], palette[3]);
  const arbitrary = ARBITRARY_RE.exec(utility);
  if (arbitrary) return suggest(arbitrary[1], undefined, undefined);
  if (HEX_RE.test(utility)) return 'a semantic token class (bg-background, text-foreground, border-border, bg-app)';
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use semantic color tokens (`bg-background`, `text-foreground`, `border-border`): never raw colors (`bg-white`, `text-gray-500`, `bg-[#fff]`).',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md',
    },
    schema: [],
    messages: {
      raw:
        'Found the raw color class "{{token}}". Why: raw palette colors and hex values do not follow the theme (dark mode breaks), bypass the 3-5 color palette and the pre-tested contrast of the semantic tokens. ' +
        'Fix: use {{suggestion}}. Semantic tokens: background, foreground, card, accent, muted, muted-foreground, border, input, ring, destructive, success, warning, info, app.',
    },
  },
  create(context) {
    return classGroupVisitors((tokens) => {
      for (const t of tokens) {
        const suggestion = rawColorSuggestion(t.utility);
        if (suggestion) context.report({ node: t.node, messageId: 'raw', data: { token: t.raw, suggestion } });
      }
    });
  },
};
