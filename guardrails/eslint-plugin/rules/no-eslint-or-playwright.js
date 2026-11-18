import path from 'node:path';
import { moduleSourceVisitors, mergeVisitors, packageName } from '../lib/moduleSources.js';

const ESLINT_CONFIG_FILE = /^eslint\.config\.[cm]?[jt]s$|^\.eslintrc(?:\.[cm]?js|\.json|\.ya?ml)?$/;
const PLAYWRIGHT_CONFIG_FILE = /^playwright(?:-ct)?\.config\.[cm]?[jt]s$/;
const PLAYWRIGHT_PACKAGES = new Set(['playwright', 'playwright-core', '@playwright/test', 'playwright-chromium']);

const isEslintPackage = (pkg) =>
  pkg === 'eslint' || pkg === 'typescript-eslint' || pkg.startsWith('@eslint/') || pkg.startsWith('@typescript-eslint/') ||
  pkg.startsWith('eslint-plugin-') || pkg.startsWith('eslint-config-') || /^@[^/]+\/eslint-(?:plugin|config)(?:-|$)/.test(pkg);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'oxlint is the only linter (it runs the guardrails plugin through `jsPlugins`); never add ESLint, its parsers, rule packs or configs. Runtime verify drives agent-browser; never add Playwright.',
      source: 'AGENTS.md > Prohibited Tools & Practices / Guardrails',
    },
    schema: [],
    messages: {
      eslint:
        'Found an import of "{{source}}". Why: the template lints with oxlint alone since skateboard 5.23.0; it loads guardrails/eslint-plugin through `jsPlugins` in .oxlintrc.json, so ESLint, its parsers and rule packs would be a second linter with its own config that nothing runs. ' +
        'Fix: delete the import and the package. Write the check as a rule in guardrails/eslint-plugin/rules/ (zero dependencies, the ESLint rule API oxlint implements) and enable it in .oxlintrc.json.',
      playwright:
        'Found an import of "{{source}}". Why: runtime verify drives the agent-browser CLI from bash (guardrails/verify/flows.sh, run by the my-factory verify runner); Playwright brings a second browser driver and a browser download the template does not use. ' +
        'Fix: delete the import and the package; add the flow to guardrails/verify/flows.sh with the runner helpers (`go`, `click`, `fill_in`, `see`, `at_url`).',
      configFile:
        'Found the file {{file}}. Why: the template runs oxlint (configured in .oxlintrc.json) and agent-browser (guardrails/verify/app.sh and flows.sh); an ESLint or Playwright config is either ignored or pulls the old toolchain back in. ' +
        'Fix: delete it; lint settings go in .oxlintrc.json `overrides`, verify settings in guardrails/verify/app.sh.',
    },
  },
  create(context) {
    const file = path.basename(context.filename);
    return mergeVisitors(
      {
        Program(node) {
          if (ESLINT_CONFIG_FILE.test(file) || PLAYWRIGHT_CONFIG_FILE.test(file)) context.report({ node, messageId: 'configFile', data: { file } });
        },
      },
      moduleSourceVisitors((node, source) => {
        const pkg = packageName(source);
        if (isEslintPackage(pkg)) context.report({ node, messageId: 'eslint', data: { source } });
        else if (PLAYWRIGHT_PACKAGES.has(pkg)) context.report({ node, messageId: 'playwright', data: { source } });
      }),
    );
  },
};
