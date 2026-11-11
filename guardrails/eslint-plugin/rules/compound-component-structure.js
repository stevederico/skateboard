import { findAttr, jsxName, meaningfulChildren, walkJsx } from '../lib/jsx.js';

/** Overlay families whose `XContent` needs an `XDescription` for screen readers. */
const OVERLAYS = ['Dialog', 'AlertDialog', 'Sheet', 'Drawer'];

/**
 * True when a direct Card child is raw content rather than a Card* slot.
 *
 * @param {any} child - JSX child node
 * @returns {boolean} Whether it bypasses CardHeader/CardContent/CardFooter
 */
function isRawCardChild(child) {
  if (child.type === 'JSXText') return true;
  if (child.type === 'JSXElement') return !jsxName(child.openingElement.name).startsWith('Card');
  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression;
    return expr.type === 'Literal' || expr.type === 'TemplateLiteral';
  }
  return false;
}

/**
 * True when some JSX ancestor has the given element name.
 *
 * @param {any[]} ancestors - Ancestors from the source code
 * @param {string} name - Element name to look for
 * @returns {boolean} Whether one encloses the node
 */
const insideElement = (ancestors, name) =>
  ancestors.some((a) => a.type === 'JSXElement' && jsxName(a.openingElement.name) === name);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never put raw content directly inside `<Card>` without `CardContent`; never nest Cards inside Cards; never nest Dialogs inside Dialogs; `DialogDescription` is required for accessibility.',
      source: 'skills/skateboard/rules/composition.md',
    },
    schema: [],
    messages: {
      rawInCard:
        'Found raw content directly inside `<Card>`. Why: Card slots (CardHeader, CardContent, CardFooter) own the padding, gap and typography; raw children break the spacing and diverge from every other card. ' +
        'Fix: wrap it: `<Card><CardHeader><CardTitle>…</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">…</CardContent></Card>` (all from `@stevederico/skateboard-ui/shadcn/ui/card`).',
      nestedCard:
        'Found a `<Card>` nested inside another `<Card>`. Why: stacked borders and padding create visual noise and break the elevation hierarchy. ' +
        'Fix: flatten it: use sections inside one `CardContent` (separate with `<Separator>` from `@stevederico/skateboard-ui/shadcn/ui/separator`), or lay sibling Cards out in a `grid gap-4`.',
      nestedDialog:
        'Found a `<Dialog>` nested inside another `<Dialog>`. Why: stacked modals fight over focus trapping and Escape handling, and users lose their place. ' +
        'Fix: replace the inner step in the same `DialogContent` (multi-step state), close the first dialog before opening the second, or use a `<Sheet>` for supplementary detail.',
      missingDescription:
        'Found `<{{content}}>` without a `<{{description}}>`. Why: Radix links the description to the dialog via aria-describedby; without it screen readers announce only the title and Radix logs an a11y warning. ' +
        'Fix: add `<{{description}}>` inside the header (import it from `@stevederico/skateboard-ui/shadcn/ui/{{file}}`), or pass `aria-describedby={undefined}` explicitly when there is truly nothing to describe.',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const name = jsxName(node.openingElement.name);
        if (name === 'Card') {
          const ancestors = context.sourceCode.getAncestors(node);
          if (insideElement(ancestors, 'Card')) context.report({ node: node.openingElement, messageId: 'nestedCard' });
          const raw = meaningfulChildren(node).find(isRawCardChild);
          if (raw) context.report({ node: raw, messageId: 'rawInCard' });
          return;
        }
        if (name === 'Dialog' && insideElement(context.sourceCode.getAncestors(node), 'Dialog')) {
          context.report({ node: node.openingElement, messageId: 'nestedDialog' });
          return;
        }
        const family = OVERLAYS.find((f) => name === `${f}Content`);
        if (!family || findAttr(node.openingElement, 'aria-describedby')) return;
        const description = `${family}Description`;
        let hasDescription = false;
        walkJsx(node, (child) => {
          if (jsxName(child.openingElement.name) === description) hasDescription = true;
        });
        if (!hasDescription) {
          const file = family.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          context.report({ node: node.openingElement, messageId: 'missingDescription', data: { content: name, description, file } });
        }
      },
    };
  },
};
