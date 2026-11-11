import path from 'node:path';

const SPEC_RE = /\.spec(\.[cm]?[jt]sx?)$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Name test files with `.test.ts` / `.test.tsx` suffix: never `.spec.ts`.',
      source: 'AGENTS.md > Testing Standards > Test File Conventions',
    },
    schema: [],
    messages: {
      spec:
        'Found the test file "{{name}}". Why: the test scripts only pick up *.test.* files, so a .spec file never runs and its failures go unseen. ' +
        'Fix: rename it to "{{renamed}}" next to the module it tests, and use node:test (describe/it from "node:test").',
    },
  },
  create(context) {
    return {
      Program(node) {
        const name = path.basename(context.filename);
        if (!SPEC_RE.test(name)) return;
        context.report({ node, messageId: 'spec', data: { name, renamed: name.replace(SPEC_RE, '.test$1') } });
      },
    };
  },
};
