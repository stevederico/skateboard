import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { RuleTester } from 'eslint';
import parser from '@typescript-eslint/parser';

// RuleTester looks for mocha-style globals; point it at node:test instead.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** Default file for cases that do not care where they live: a UI component. */
const DEFAULT_FILE = 'src/components/Example.tsx';

/**
 * Absolute path for a repo-relative file, so path-aware rules see the same layout
 * they see in a real `npm run lint` run (ESLint's cwd is the repo root).
 *
 * @param {string} rel - Repo-relative path
 * @returns {string} Absolute path under process.cwd()
 */
export const fileAt = (rel) => path.join(process.cwd(), rel);

/**
 * Normalize a test case: strings become `{ code }`, and `filename` is made absolute.
 *
 * @param {string | { code: string, filename?: string }} testCase - Valid or invalid case
 * @returns {object} RuleTester case
 */
function withFile(testCase) {
  const c = typeof testCase === 'string' ? { code: testCase } : testCase;
  return { ...c, filename: fileAt(c.filename ?? DEFAULT_FILE) };
}

/**
 * Run RuleTester cases for one rule plus the guardrail contract every rule must meet:
 * it documents the written rule it enforces, and every message names what was found,
 * why it is banned ("Why:"), and the exact fix ("Fix:").
 *
 * @param {string} name - Rule name (without the `skateboard/` prefix)
 * @param {import('eslint').Rule.RuleModule} rule - Rule under test
 * @param {{ valid: Array<string | object>, invalid: Array<object> }} cases - Test cases
 */
export function runRuleTests(name, rule, { valid, invalid }) {
  describe(`${name} contract`, () => {
    it('documents the written rule and where it lives', () => {
      assert.ok(rule.meta?.docs?.description, 'meta.docs.description must quote the written rule');
      assert.ok(rule.meta?.docs?.source, 'meta.docs.source must name the doc that states the rule');
    });

    it('teaches the root cause and the fix in every message', () => {
      for (const [id, message] of Object.entries(rule.meta.messages ?? {})) {
        assert.match(message, /Why: /, `${name}.${id} must explain why`);
        assert.match(message, /Fix: /, `${name}.${id} must give the fix`);
      }
    });
  });

  const tester = new RuleTester({
    languageOptions: {
      parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  });
  tester.run(name, rule, { valid: valid.map(withFile), invalid: invalid.map(withFile) });
}
