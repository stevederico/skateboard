import { findAttr, hasSpread, jsxName, staticAttrValue } from '../lib/jsx.js';

/** skateboard-ui text controls that need an associated label. */
const CONTROLS = new Set(['Input', 'Textarea']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'All form inputs must be associated with a `<Label>` via `htmlFor`/`id` pairing or by nesting.',
      source: 'AGENTS.md > Accessibility > Required on Every Element; skills/skateboard/rules/forms.md > Label + Input Pairing',
    },
    schema: [],
    messages: {
      unlabeled:
        'Found an `<{{name}}>` with no `id`, `aria-label`, `aria-labelledby`, or wrapping `<Label>`. Why: placeholder text is not a label; screen readers announce an unnamed field and clicking the label text does not focus it. ' +
        'Fix: pair it with a label inside `<Field>`: `<Label htmlFor="email">Email</Label><{{name}} id="email" />` (Label from `@stevederico/skateboard-ui/shadcn/ui/label`, Field from `@stevederico/skateboard-ui/shadcn/ui/field`); use `aria-label` only when no visible label fits (e.g. a search box).',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = jsxName(node.name);
        if (!CONTROLS.has(name) || hasSpread(node)) return;
        if (staticAttrValue(findAttr(node, 'type')) === 'hidden') return;
        if (['id', 'aria-label', 'aria-labelledby'].some((a) => findAttr(node, a))) return;
        const insideLabel = context.sourceCode.getAncestors(node).some(
          (a) => a.type === 'JSXElement' && ['Label', 'label'].includes(jsxName(a.openingElement.name)),
        );
        if (!insideLabel) context.report({ node, messageId: 'unlabeled', data: { name } });
      },
    };
  },
};
