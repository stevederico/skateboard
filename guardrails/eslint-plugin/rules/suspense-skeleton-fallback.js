import { findAttr, jsxName, walkJsx } from '../lib/jsx.js';

/**
 * True when a fallback expression is, or contains, a `<Spinner>`.
 *
 * @param {any} expr - Fallback expression
 * @returns {boolean} Whether a spinner is rendered
 */
function rendersSpinner(expr) {
  if (expr?.type !== 'JSXElement' && expr?.type !== 'JSXFragment') return false;
  if (expr.type === 'JSXElement' && jsxName(expr.openingElement.name) === 'Spinner') return true;
  let found = false;
  walkJsx(expr, (child) => {
    if (jsxName(child.openingElement.name) === 'Spinner') found = true;
  });
  return found;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Never use a centered Spinner as a lazy-route Suspense fallback; the fallback should be view-shaped.',
      source: 'skills/skateboard/rules/views.md > Loading States',
    },
    schema: [],
    messages: {
      spinnerFallback:
        'Found a `<Suspense>` whose fallback renders `<Spinner>`. Why: a centered spinner flashes and then the whole layout jumps when the view arrives (layout shift), while a view-shaped skeleton keeps the shell stable. ' +
        'Fix: pass a skeleton that mirrors the view, e.g. `fallback={<HomeViewSkeleton />}` (see src/components/HomeViewSkeleton.tsx) or `PageSkeleton` / `CardListSkeleton` from `@stevederico/skateboard-ui/ui/skeleton`; keep `<Spinner>` for button/form actions.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (jsxName(node.name) !== 'Suspense') return;
        const fallback = findAttr(node, 'fallback');
        const expr = fallback?.value?.type === 'JSXExpressionContainer' ? fallback.value.expression : null;
        if (rendersSpinner(expr)) context.report({ node: fallback, messageId: 'spinnerFallback' });
      },
    };
  },
};
