/**
 * ESLint flat config. ESLint here runs ONLY the local guardrails plugin
 * (guardrails/eslint-plugin): each rule is a written "never" rule from AGENTS.md or
 * skills/skateboard/rules/*.md, with a message that teaches the root cause and the fix.
 * No third-party rule packs, no `globals` package.
 *
 * ESLint and the TypeScript parser live in guardrails/ (nested private package) so the
 * root keeps TypeScript 7. Install once with `npm run guardrails:install`, then
 * `npm run lint`.
 */
import plugin, { parser } from './guardrails/eslint-plugin/index.js';

export default [
  {
    name: 'skateboard/ignores',
    ignores: ['**/node_modules/**', 'dist/**', 'backend/**', 'guardrails/node_modules/**', 'public/**', 'verify-artifacts/**'],
  },
  {
    name: 'skateboard/parser',
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    languageOptions: {
      parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    ...plugin.configs.base,
    files: [
      'src/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      'scripts/**/*.{js,mjs,ts}',
      'vite.*.ts',
      'vite.*.js',
      'eslint.config.js',
      '.dependency-cruiser.js',
      'guardrails/eslint-plugin/**/*.js',
      'guardrails/verify/**/*.js',
      // Banned toolchain config files are linted only so their existence is reported.
      '**/{tailwind,postcss}.config.{js,cjs,mjs,ts}',
    ],
  },
  {
    ...plugin.configs.app,
    files: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
  },
  {
    // RuleTester fixtures are strings of deliberately bad code; a fixture such as
    // 'mongodb://admin:pw@db/app' must not fail lint on the plugin that bans it.
    name: 'skateboard/guardrails-fixtures',
    files: ['guardrails/eslint-plugin/rules/*.test.js'],
    rules: { 'skateboard/no-hardcoded-connection-strings': 'off' },
  },
];
