/**
 * Loads server.ts in a fresh production-mode process for import-time branch coverage.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

describe('production server import', () => {
  it('initializes with production secure headers and skips dev env loading', () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.SKIP_SERVER_START = '1';
      process.env.JWT_SECRET = 'prod-test-secret';
      process.env.STRIPE_KEY = 'sk_test_prod';
      process.env.STRIPE_ENDPOINT_SECRET = 'whsec_prod';
      process.env.TEST_DATABASE_PATH = './databases/prod-import-test.db';
      const {
        app,
        __testBuildSecureHeadersOptions,
      } = await import('./server.ts');
      const headers = __testBuildSecureHeadersOptions(true);
      if (headers.strictTransportSecurity === false) process.exit(3);
      const res = await app.fetch(new Request('http://localhost/api/health'));
      if (res.status !== 200) process.exit(4);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it('starts HTTP server using an injected serve factory', () => {
    const script = `
      let serveCalled = false;
      const fakeServe = (options, onListen) => {
        serveCalled = true;
        onListen({ port: options.port || 8000 });
        return { close: () => {} };
      };
      process.env.SKIP_SERVER_START = '1';
      process.env.JWT_SECRET = 'startup-test-secret';
      process.env.STRIPE_KEY = 'sk_test_startup';
      process.env.STRIPE_ENDPOINT_SECRET = 'whsec_startup';
      process.env.TEST_DATABASE_PATH = './databases/startup-serve-test.db';
      const { __testSetServeFactory, __testStartHttpServer } = await import('./server.ts');
      __testSetServeFactory(fakeServe);
      const httpServer = __testStartHttpServer();
      if (!serveCalled || !httpServer) process.exit(2);
    `;
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      script,
    ], {
      cwd: BACKEND_DIR,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});