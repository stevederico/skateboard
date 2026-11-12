import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import plugin, { APP_RULES, BASE_RULES, parser } from './index.js';
import { ALLOWED_EDGES, LAYERS, TARGET_GUIDANCE, layerOf } from './layers.js';

const RULES_DIR = fileURLToPath(new URL('./rules/', import.meta.url));
const files = readdirSync(RULES_DIR);
const ruleFiles = files.filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).map((f) => f.slice(0, -3));

describe('plugin registry', () => {
  it('registers every rule file under its file name', () => {
    assert.deepEqual(Object.keys(plugin.rules).sort(), ruleFiles.sort());
  });

  it('ships a RuleTester file for every rule', () => {
    const missing = ruleFiles.filter((name) => !files.includes(`${name}.test.js`));
    assert.deepEqual(missing, []);
  });

  it('enables every rule in exactly one config', () => {
    const enabled = [...Object.keys(plugin.configs.base.rules), ...Object.keys(plugin.configs.app.rules)]
      .filter((key) => key.startsWith('skateboard/'))
      .map((key) => key.slice('skateboard/'.length));
    assert.deepEqual(enabled.sort(), Object.keys(plugin.rules).sort());
    const overlap = Object.keys(BASE_RULES).filter((name) => Object.hasOwn(APP_RULES, name));
    assert.deepEqual(overlap, []);
  });

  it('re-exports the TypeScript parser for the root config', () => {
    assert.equal(typeof parser.parseForESLint, 'function');
  });

  it('exposes meta with the skateboard namespace', () => {
    assert.equal(plugin.meta.namespace, 'skateboard');
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
    assert.equal(layerOf('eslint.config.js')?.name, 'guardrails');
    assert.equal(layerOf('public/theme-init.js'), undefined);
  });
});
