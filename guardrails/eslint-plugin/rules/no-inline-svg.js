import { jsxName } from '../lib/jsx.js';
import { repoRelative } from '../lib/paths.js';

/** The single icon module: the only place vendored SVG components may live. */
const ICON_FUNNEL = /^src\/icons\.tsx?$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Don't use raw SVGs when a Lucide icon exists; never generate decorative SVGs. Icons go through the one app icon module (src/icons.ts).",
      source: 'skills/skateboard/rules/icons.md > Don\'t; AGENTS.md > Styling & UI',
    },
    schema: [],
    messages: {
      inlineSvg:
        'Found an inline `<svg>` in a component. Why: hand-pasted SVGs bypass the icon funnel, so the icon set stops being auditable, sizes/stroke drift, and decorative SVG shapes creep in. ' +
        'Fix: use a Lucide icon (add its name to `src/icons.ts`, then `import { Name } from \'../icons\'`); if the glyph truly has no Lucide equivalent, vendor it once as a named component in the icon module (rename it to `src/icons.tsx` when it needs JSX) and import it from there.',
    },
  },
  create(context) {
    if (ICON_FUNNEL.test(repoRelative(context))) return {};
    return {
      JSXOpeningElement(node) {
        if (jsxName(node.name) === 'svg') context.report({ node, messageId: 'inlineSvg' });
      },
    };
  },
};
