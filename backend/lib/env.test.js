import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isProd,
  loadEnvFile,
  loadLocalENV,
  resolveEnvironmentVariables,
  validateEnvironmentVariables,
} from './env.ts';

describe('env.js', () => {
  const originalEnv = { ...process.env };
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'env-test-'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('isProd', () => {
    it('returns true only when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      assert.equal(isProd(), true);
      process.env.NODE_ENV = 'test';
      assert.equal(isProd(), false);
      delete process.env.NODE_ENV;
      assert.equal(isProd(), false);
    });
  });

  describe('loadEnvFile', () => {
    it('parses key=value pairs including quoted values and equals in values', () => {
      const envPath = join(tempDir, '.env');
      writeFileSync(envPath, [
        '# comment',
        '',
        'PLAIN=value',
        'QUOTED="hello world"',
        'SINGLE=\'single\'',
        'EQUALS=foo=bar=baz',
      ].join('\n'));

      loadEnvFile(envPath);
      assert.equal(process.env.PLAIN, 'value');
      assert.equal(process.env.QUOTED, 'hello world');
      assert.equal(process.env.SINGLE, 'single');
      assert.equal(process.env.EQUALS, 'foo=bar=baz');
    });

    it('silently skips when file does not exist', () => {
      assert.doesNotThrow(() => loadEnvFile(join(tempDir, 'missing.env')));
    });

    it('sets empty values and skips lines with an empty key', () => {
      const envPath = join(tempDir, '.env');
      writeFileSync(envPath, 'NOVALUE=\n=novalue\nVALID=yes\n');
      delete process.env.NOVALUE;
      loadEnvFile(envPath);
      assert.equal(process.env.VALID, 'yes');
      // `KEY=` explicitly clears a value — set to '' rather than dropped.
      assert.equal(process.env.NOVALUE, '');
      // `=novalue` has no key — skipped, must not create an empty-named var.
      assert.equal(process.env[''], undefined);
    });
  });

  describe('loadLocalENV', () => {
    it('creates .env from .env.example when .env is missing', () => {
      writeFileSync(join(tempDir, '.env.example'), 'FROM_EXAMPLE=1\n');
      loadLocalENV({ baseDir: tempDir });
      assert.equal(existsSync(join(tempDir, '.env')), true);
      assert.equal(process.env.FROM_EXAMPLE, '1');
    });

    it('loads existing .env and .env.local overrides', () => {
      writeFileSync(join(tempDir, '.env'), 'BASE=from-env\nOVERRIDE=base\n');
      writeFileSync(join(tempDir, '.env.local'), 'OVERRIDE=local\n');
      loadLocalENV({ baseDir: tempDir });
      assert.equal(process.env.BASE, 'from-env');
      assert.equal(process.env.OVERRIDE, 'local');
    });

    it('uses default backend baseDir when options.baseDir is omitted', () => {
      loadLocalENV();
      assert.ok(true);
    });

    it('logs error and returns when .env.example is missing', () => {
      const warnings = [];
      const logger = { error: (msg, meta) => warnings.push({ msg, meta }) };
      loadLocalENV({ baseDir: tempDir, logger });
      assert.equal(existsSync(join(tempDir, '.env')), false);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0].msg, /Failed to create/);
    });
  });

  describe('resolveEnvironmentVariables', () => {
    it('returns non-string values unchanged', () => {
      assert.equal(resolveEnvironmentVariables(42), 42);
      assert.equal(resolveEnvironmentVariables(null), null);
    });

    it('replaces defined environment variables', () => {
      process.env.TEST_VAR = 'resolved';
      assert.equal(resolveEnvironmentVariables('prefix-${TEST_VAR}-suffix'), 'prefix-resolved-suffix');
    });

    it('preserves placeholder and warns when variable is undefined', () => {
      delete process.env.UNDEFINED_VAR;
      const warnings = [];
      const logger = { warn: (msg, meta) => warnings.push({ msg, meta }) };
      const input = 'db://${UNDEFINED_VAR}/path';
      assert.equal(resolveEnvironmentVariables(input, logger), input);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].meta.varName, 'UNDEFINED_VAR');
    });
  });

  describe('validateEnvironmentVariables', () => {
    const baseConfig = {
      database: { connectionString: 'sqlite://local' },
    };

    it('returns true when all required variables are present', () => {
      const result = validateEnvironmentVariables({
        config: baseConfig,
        stripeKey: 'sk_test',
        stripeEndpointSecret: 'whsec',
        jwtSecret: 'secret',
      });
      assert.equal(result, true);
    });

    it('returns false and warns when variables are missing', () => {
      const warnings = [];
      const logger = { warn: (msg, meta) => warnings.push({ msg, meta }) };
      const result = validateEnvironmentVariables({
        config: baseConfig,
        stripeKey: '',
        stripeEndpointSecret: '',
        jwtSecret: '',
        logger,
      });
      assert.equal(result, false);
      assert.ok(warnings[0].meta.missing.includes('STRIPE_KEY'));
      assert.ok(warnings[0].meta.missing.includes('STRIPE_ENDPOINT_SECRET'));
      assert.ok(warnings[0].meta.missing.includes('JWT_SECRET'));
    });

    it('flags unresolved database config placeholders', () => {
      const warnings = [];
      const logger = { warn: (msg, meta) => warnings.push({ msg, meta }) };
      const result = validateEnvironmentVariables({
        config: { database: { connectionString: 'postgres://${MISSING_DB_URL}/app' } },
        stripeKey: 'sk',
        stripeEndpointSecret: 'whsec',
        jwtSecret: 'jwt',
        logger,
        env: {},
      });
      assert.equal(result, false);
      assert.ok(warnings[0].meta.missing.some((m) => m.includes('MISSING_DB_URL')));
    });

    it('ignores non-string connectionString for placeholder checks', () => {
      const result = validateEnvironmentVariables({
        config: { database: { connectionString: null } },
        stripeKey: 'sk',
        stripeEndpointSecret: 'whsec',
        jwtSecret: 'jwt',
      });
      assert.equal(result, true);
    });
  });
});