import { collectStrings, tokenize } from '../lib/classStrings.js';
import { findAttr, hasSpread, jsxName } from '../lib/jsx.js';
import { resolveSpecifier } from '../lib/paths.js';

/** Repo path of the app icon module, with or without extension. */
const ICON_FUNNEL = /^src\/icons(\.tsx?)?$/;

/**
 * True when an import specifier points at the icon funnel or at lucide-react.
 *
 * @param {import('eslint').Rule.RuleContext} context - Rule context
 * @param {string} source - Import specifier
 * @returns {boolean} Whether the imported names are icons
 */
function isIconSource(context, source) {
  if (source === 'lucide-react') return true;
  const target = resolveSpecifier(context, source);
  return target !== null && ICON_FUNNEL.test(target);
}

/**
 * True when the element's className includes a `size-*` utility.
 *
 * @param {any} node - JSXOpeningElement
 * @returns {boolean} Whether a size class is present
 */
function hasSizeClass(node) {
  const attr = findAttr(node, 'className');
  if (!attr?.value) return false;
  return tokenize(collectStrings(attr.value, new Set())).some((t) => t.utility.startsWith('size-'));
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Don't use icons without sizing: always set `size` (16 inline, 18 buttons, 24 cards, 48 empty states).",
      source: 'skills/skateboard/rules/icons.md > Sizing; AGENTS.md > Icons',
    },
    schema: [],
    messages: {
      missingSize:
        'Found `<{{name}}>` without a `size` prop or `size-*` class. Why: an unsized icon falls back to 24px or whatever a parent selector forces, so the same icon renders at different sizes across views. ' +
        'Fix: set the standard size explicitly: `<{{name}} size={16} />` inline with text, `size={18}` in buttons, `size={24}` in cards, `size={48}` in empty states (or `className="size-4"`).',
    },
  },
  create(context) {
    const iconNames = new Set();
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string' || !isIconSource(context, node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') iconNames.add(spec.local.name);
        }
      },
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        if (!iconNames.has(name) || hasSpread(node)) return;
        if (findAttr(node, 'size') || hasSizeClass(node)) return;
        context.report({ node, messageId: 'missingSize', data: { name } });
      },
    };
  },
};
