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
      '**/{tailwind,postcss}.config.{js,cjs,mjs,ts}',
    ],
  },
  {
    ...plugin.configs.app,
    files: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
  },
  {
    name: 'skateboard/guardrails-fixtures',
    files: ['guardrails/eslint-plugin/rules/*.test.js'],
    rules: { 'skateboard/no-hardcoded-connection-strings': 'off' },
  },
];
