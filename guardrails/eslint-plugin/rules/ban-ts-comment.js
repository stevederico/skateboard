/** Minimum length of the reason after `@ts-expect-error`, so "fix" or "todo" do not count. */
const MIN_REASON_LENGTH = 10;

// A ts directive at the start of a line comment, block comment, or JSDoc line.
const DIRECTIVE = /^\s*(?:\*\s*)?@ts-(ignore|nocheck|expect-error)\b(.*)$/m;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Never use `@ts-ignore` or `@ts-nocheck`; if truly unavoidable use `@ts-expect-error` with a reason comment.',
      source: 'AGENTS.md > TypeScript Anti-Patterns',
    },
    schema: [],
    messages: {
      ignore:
        'Found `@ts-ignore`. Why: it silences the next line forever, even after the error is fixed or turns into a different, real bug. ' +
        'Fix: fix the type error. If it is a genuine upstream type bug, use `// @ts-expect-error -- <why, with a link or issue>`, which fails the build once the error disappears.',
      nocheck:
        'Found `@ts-nocheck`. Why: it turns type checking off for the whole file, which is stronger than `@ts-ignore` and hides every future mistake in it. ' +
        'Fix: delete the directive and fix the reported errors (run `npm run typecheck`). Narrow single unavoidable errors with `// @ts-expect-error -- <reason>`.',
      expectErrorReason:
        'Found `@ts-expect-error` without a reason. Why: a bare suppression gives the next reader no way to know whether it is still needed or safe to remove. ' +
        'Fix: write why on the same line: `// @ts-expect-error -- skateboard-ui 5.11 types omit the optional "overrides" prop` (at least 10 characters).',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = DIRECTIVE.exec(comment.value);
          if (!match) continue;
          const [, kind, rest] = match;
          if (kind === 'ignore') context.report({ loc: comment.loc, messageId: 'ignore' });
          if (kind === 'nocheck') context.report({ loc: comment.loc, messageId: 'nocheck' });
          const reason = rest.replace(/^[\s:-]+/, '').replace(/\*\/?\s*$/, '').trim();
          if (kind === 'expect-error' && reason.length < MIN_REASON_LENGTH) {
            context.report({ loc: comment.loc, messageId: 'expectErrorReason' });
          }
        }
      },
    };
  },
};
