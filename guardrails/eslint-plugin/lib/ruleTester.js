import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin, { NAMESPACE } from '../index.js';

const PLUGIN_PATH = fileURLToPath(new URL('../index.js', import.meta.url));
const DEFAULT_FILE = 'src/components/Example.tsx';
const OXLINT = process.env.OXLINT ?? 'oxlint';
const CONCURRENCY = Math.max(2, availableParallelism());
const MAX_OUTPUT = 16 * 1024 * 1024;
const OXLINT_MISSING =
  'oxlint is not on PATH. The guardrail tests run every case through the real oxlint binary. Install it once with `mise use -g npm:oxlint` (or `npm install -g oxlint`), or point OXLINT at the binary.';

const ruleIdOf = (rule) => Object.keys(plugin.rules).find((name) => plugin.rules[name] === rule);

const asCase = (testCase) => (typeof testCase === 'string' ? { code: testCase } : testCase);

const preview = (code) => code.replace(/\s+/g, ' ').trim().slice(0, 70);

function runOxlint(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(OXLINT, args, { cwd, maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') return reject(new Error(OXLINT_MISSING));
      if (!stdout.trim()) return reject(new Error(`oxlint printed no report (exit ${error?.code ?? 0}): ${stderr}`));
      resolve(stdout);
    });
  });
}

async function lintCase(ruleId, testCase) {
  const root = mkdtempSync(path.join(tmpdir(), `skateboard-${ruleId}-`));
  try {
    const filename = testCase.filename ?? DEFAULT_FILE;
    const file = path.join(root, filename);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, testCase.code);
    const config = {
      plugins: [],
      categories: { correctness: 'off' },
      jsPlugins: [PLUGIN_PATH],
      rules: { [`${NAMESPACE}/${ruleId}`]: ['error', ...(testCase.options ?? [])] },
    };
    writeFileSync(path.join(root, '.oxlintrc.json'), JSON.stringify(config));
    const report = JSON.parse(await runOxlint(['--format=json', '--threads=1', filename], root));
    return report.diagnostics
      .map((d) => ({ code: d.code, message: d.message, line: d.labels?.[0]?.span.line ?? 0, column: d.labels?.[0]?.span.column ?? 0 }))
      .sort((a, b) => a.line - b.line || a.column - b.column);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const PLACEHOLDER = /\{\{([^{}]+?)\}\}/g;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function expectedMessage(rule, error) {
  if (error.message) return error.message;
  const template = rule.meta.messages?.[error.messageId];
  assert.ok(template, `unknown messageId "${error.messageId}"`);
  if (!error.data) {
    const parts = template.split(PLACEHOLDER).filter((_, i) => i % 2 === 0).map(escapeRegExp);
    return new RegExp(`^${parts.join('[\\s\\S]*?')}$`);
  }
  return template.replace(PLACEHOLDER, (whole, key) => (Object.hasOwn(error.data, key.trim()) ? String(error.data[key.trim()]) : whole));
}

function assertFindings(rule, ruleId, actual, errors) {
  const code = `${NAMESPACE}(${ruleId})`;
  const foreign = actual.filter((d) => d.code !== code);
  assert.deepEqual(foreign, [], 'oxlint reported something other than the rule under test (a parse error?)');
  assert.equal(actual.length, errors.length, `expected ${errors.length} finding(s), got:\n${actual.map((d) => d.message).join('\n')}`);
  errors.forEach((error, index) => {
    const found = actual[index];
    const expected = expectedMessage(rule, error);
    if (expected instanceof RegExp) assert.match(found.message, expected);
    else assert.equal(found.message, expected);
    if (error.line !== undefined) assert.equal(found.line, error.line);
    if (error.column !== undefined) assert.equal(found.column, error.column);
  });
}

function assertContract(name, rule) {
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
}

export function runRuleTests(name, rule, { valid, invalid }) {
  assertContract(name, rule);
  const ruleId = ruleIdOf(rule);

  describe(name, { concurrency: CONCURRENCY }, () => {
    it('is registered in the plugin', () => assert.ok(ruleId, `${name} is not in guardrails/eslint-plugin/index.js`));
    if (!ruleId) return;

    valid.map(asCase).forEach((testCase, index) => {
      it(`valid #${index}: ${preview(testCase.code)}`, async () => {
        assertFindings(rule, ruleId, await lintCase(ruleId, testCase), []);
      });
    });

    invalid.map(asCase).forEach((testCase, index) => {
      it(`invalid #${index}: ${preview(testCase.code)}`, async () => {
        assert.ok(testCase.errors?.length, 'an invalid case must list the errors it expects');
        assertFindings(rule, ruleId, await lintCase(ruleId, testCase), testCase.errors);
      });
    });
  });
}
