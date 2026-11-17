import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import plugin, { APP_RULES, BASE_RULES, CORE_RULES, NAMESPACE } from './index.js';
import { ALLOWED_EDGES, LAYERS, TARGET_GUIDANCE, layerOf } from './layers.js';

const RULES_DIR = fileURLToPath(new URL('./rules/', import.meta.url));
const OXLINTRC = fileURLToPath(new URL('../../.oxlintrc.json', import.meta.url));
const files = readdirSync(RULES_DIR);
const ruleFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).map((f) => f.slice(0, -3));
const oxlintrc = JSON.parse(readFileSync(OXLINTRC, 'utf8'));
const [baseOverride, appOverride] = oxlintrc.overrides;
const pluginRules = (rules) =>
  Object.entries(rules)
    .filter(([key, level]) => key.startsWith(`${NAMESPACE}/`) && level === 'error')
    .map(([key]) => key.slice(NAMESPACE.length + 1))
    .sort();

describe('plugin registry', () => {
  it('registers every rule file under its file name', () => {
    assert.deepEqual(Object.keys(plugin.rules).sort(), ruleFiles.sort());
  });

  it('ships a test file for every rule', () => {
    const missing = ruleFiles.filter((name) => !files.includes(`${name}.test.js`));
    assert.deepEqual(missing, []);
  });

  it('keeps base and app rules disjoint', () => {
    const overlap = Object.keys(BASE_RULES).filter((name) => Object.hasOwn(APP_RULES, name));
    assert.deepEqual(overlap, []);
  });

  it('exposes meta whose name oxlint turns into the skateboard namespace', () => {
    assert.equal(plugin.meta.name, `eslint-plugin-${NAMESPACE}`);
  });
});

describe('.oxlintrc.json', () => {
  it('loads this plugin through jsPlugins', () => {
    assert.deepEqual(oxlintrc.jsPlugins, ['./guardrails/eslint-plugin/index.js']);
  });

  it('runs no built-in oxlint rules beyond the core four', () => {
    assert.deepEqual(oxlintrc.plugins, []);
    assert.deepEqual(oxlintrc.categories, { correctness: 'off' });
    assert.equal(oxlintrc.rules, undefined);
  });

  it('fails on unused disable directives and on warnings', () => {
    assert.deepEqual(oxlintrc.options, { reportUnusedDisableDirectives: 'error', denyWarnings: true });
  });

  it('enables every base rule plus the core rules in the base override', () => {
    assert.deepEqual(pluginRules(baseOverride.rules), Object.keys(BASE_RULES).sort());
    for (const [name, setting] of Object.entries(CORE_RULES)) assert.deepEqual(baseOverride.rules[name], setting);
  });

  it('enables every app rule in the src/-only app override', () => {
    assert.deepEqual(pluginRules(appOverride.rules), Object.keys(APP_RULES).sort());
    assert.deepEqual(appOverride.files, ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}']);
  });

  it('applies the base override to src/ too', () => {
    assert.ok(baseOverride.files.includes('src/**/*.{ts,tsx,js,jsx,mjs,cjs}'));
  });
});

describe('layer table', () => {
  it('gives every layer allowed edges and teaching guidance', () => {
    for (const { name } of LAYERS) {
      assert.ok(ALLOWED_EDGES[name], `ALLOWED_EDGES is missing ${name}`);
      assert.ok(TARGET_GUIDANCE[name]?.why && TARGET_GUIDANCE[name]?.fix, `TARGET_GUIDANCE is missing ${name}`);
    }
  });

  it('only allows edges to known layers', () => {
    const names = new Set(LAYERS.map((l) => l.name));
    for (const targets of Object.values(ALLOWED_EDGES)) for (const t of targets) assert.ok(names.has(t), `unknown layer ${t}`);
  });

  it('classifies the real repo layout', () => {
    assert.equal(layerOf('src/components/HomeView.tsx')?.name, 'ui');
    assert.equal(layerOf('src/main.tsx')?.name, 'app');
    assert.equal(layerOf('src/icons.ts')?.name, 'app');
    assert.equal(layerOf('backend/src/routes.rs')?.name, 'server');
    assert.equal(layerOf('scripts/update-skateboard.js')?.name, 'tooling');
    assert.equal(layerOf('vite.plugins.ts')?.name, 'build');
    assert.equal(layerOf('.oxlintrc.json')?.name, 'guardrails');
    assert.equal(layerOf('.dependency-cruiser.js')?.name, 'guardrails');
    assert.equal(layerOf('public/theme-init.js'), undefined);
  });
});
