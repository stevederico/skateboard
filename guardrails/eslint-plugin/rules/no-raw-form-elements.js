import { findAttr, jsxName, staticAttrValue } from '../lib/jsx.js';

const UI = '@stevederico/skateboard-ui/shadcn/ui';

/** Replacement per raw element (and per `<input type>`). */
const FIXES = {
  button: `\`import { Button } from '${UI}/button'\` and render \`<Button>\` (variants: default, outline, ghost, destructive, link; \`size="icon"\` + aria-label for icon-only)`,
  input: `\`import { Input } from '${UI}/input'\` paired with \`<Label htmlFor>\` from '${UI}/label' inside \`<Field>\``,
  checkbox: `\`<Checkbox>\` from '${UI}/checkbox' (or \`<Switch>\` from '${UI}/switch' for on/off settings) with a \`<Label>\``,
  radio: `\`<RadioGroup>\` + \`<RadioGroupItem>\` from '${UI}/radio-group' (or \`<ToggleGroup>\` for 2-4 visible choices)`,
  textarea: `\`import { Textarea } from '${UI}/textarea'\` paired with \`<Label htmlFor>\``,
  select: `\`<Select>\` + \`<SelectTrigger>\` / \`<SelectContent>\` / \`<SelectItem>\` from '${UI}/select'`,
  anchor: `\`<Button variant="link" onClick={handleX}>\` from '${UI}/button' for actions, or give the link a real \`href\` (use \`useSafeNavigate()\` from '@stevederico/skateboard-ui/Utilities' in the handler for in-app routes)`,
};

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use the right component: `<Button>` not `<button>`, `<Input>` + `<Label>` not `<input>`; never raw `<button>` / `<a onClick>`, bare `<textarea>`, native `<select>`.',
      source: 'AGENTS.md > Component Selection; skills/skateboard/SKILL.md > Component selection',
    },
    schema: [],
    messages: {
      raw:
        'Found a raw `<{{tag}}>` element. Why: skateboard-ui primitives carry the theme tokens, focus rings, disabled/invalid states, dark mode and accessibility wiring; raw elements drift from the design system and skip them. ' +
        'Fix: {{fix}}.',
      anchorAction:
        'Found `<a onClick>` without an `href`. Why: an anchor with no href is not focusable or announced as a button, so keyboard and screen-reader users cannot trigger it. ' +
        'Fix: {{fix}}.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = jsxName(node.name);
        if (tag === 'a') {
          if (findAttr(node, 'onClick') && !findAttr(node, 'href')) {
            context.report({ node, messageId: 'anchorAction', data: { fix: FIXES.anchor } });
          }
          return;
        }
        if (!['button', 'input', 'textarea', 'select'].includes(tag)) return;
        let fixKey = tag;
        if (tag === 'input') {
          const type = staticAttrValue(findAttr(node, 'type'));
          if (type === 'hidden') return;
          if (type === 'checkbox' || type === 'radio') fixKey = type;
        }
        context.report({ node, messageId: 'raw', data: { tag, fix: FIXES[fixKey] } });
      },
    };
  },
};
