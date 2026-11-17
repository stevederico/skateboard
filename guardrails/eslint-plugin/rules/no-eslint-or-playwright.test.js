import rule from './no-eslint-or-playwright.js';
import { runRuleTests } from '../lib/ruleTester.js';

runRuleTests('no-eslint-or-playwright', rule, {
  valid: [
    { code: "import plugin from './guardrails/eslint-plugin/index.js';", filename: 'scripts/tool.js' },
    { code: "import { LAYERS } from './guardrails/eslint-plugin/layers.js';", filename: '.dependency-cruiser.js' },
    { code: "import { execFile } from 'node:child_process';", filename: 'guardrails/verify/verify.e2e.js' },
    { code: "import { defineConfig } from 'vite';", filename: 'vite.config.ts' },
    { code: 'export default {};', filename: 'scripts/eslintReport.js' },
  ],
  invalid: [
    { code: "import { ESLint } from 'eslint';", filename: 'scripts/tool.js', errors: [{ messageId: 'eslint', data: { source: 'eslint' } }] },
    { code: "import { RuleTester } from 'eslint/rule-tester';", filename: 'guardrails/eslint-plugin/lib/ruleTester.js', errors: [{ messageId: 'eslint' }] },
    { code: "import parser from '@typescript-eslint/parser';", filename: 'guardrails/eslint-plugin/index.js', errors: [{ messageId: 'eslint' }] },
    { code: "import js from '@eslint/js';", filename: 'scripts/tool.js', errors: [{ messageId: 'eslint' }] },
    { code: "import react from 'eslint-plugin-react';", filename: 'scripts/tool.js', errors: [{ messageId: 'eslint' }] },
    { code: "import tseslint from 'typescript-eslint';", filename: 'scripts/tool.js', errors: [{ messageId: 'eslint' }] },
    { code: "import query from '@tanstack/eslint-plugin-query';", filename: 'scripts/tool.js', errors: [{ messageId: 'eslint' }] },
    { code: "import { test, expect } from '@playwright/test';", filename: 'guardrails/verify/verify.e2e.js', errors: [{ messageId: 'playwright', data: { source: '@playwright/test' } }] },
    { code: "const { chromium } = await import('playwright');", filename: 'scripts/shots.js', errors: [{ messageId: 'playwright' }] },
    { code: 'export default [];', filename: 'eslint.config.js', errors: [{ messageId: 'configFile', data: { file: 'eslint.config.js' } }] },
    { code: 'module.exports = {};', filename: '.eslintrc.cjs', errors: [{ messageId: 'configFile' }] },
    { code: 'export default {};', filename: 'guardrails/verify/playwright.config.js', errors: [{ messageId: 'configFile', data: { file: 'playwright.config.js' } }] },
  ],
});
