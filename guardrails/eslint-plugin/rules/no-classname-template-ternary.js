import { CLASS_ATTRIBUTES } from '../lib/classStrings.js';

const CONDITIONAL = new Set(['ConditionalExpression', 'LogicalExpression']);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use `cn()` for conditional class composition: never template literal ternaries.',
      source: 'AGENTS.md > Styling & UI; skills/skateboard/rules/styling.md > Layout Rules',
    },
    schema: [],
    messages: {
      template:
        'Found a conditional inside a className template literal. Why: string-glued classes leave stray spaces and "false"/"undefined" tokens, and cannot resolve Tailwind conflicts (p-2 vs p-4), so the last class does not reliably win. ' +
        'Fix: compose with cn() (`import { cn } from "@stevederico/skateboard-ui/shadcn/lib/utils"`, which merges conflicting Tailwind classes): className={cn("base classes", isActive && "bg-accent", isLarge ? "p-6" : "p-4")}.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!CLASS_ATTRIBUTES.has(node.name.name)) return;
        const expr = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : null;
        if (expr?.type !== 'TemplateLiteral') return;
        const conditional = expr.expressions.find((e) => CONDITIONAL.has(e.type));
        if (conditional) context.report({ node: conditional, messageId: 'template' });
      },
    };
  },
};
