/**
 * Server lifecycle and branch-coverage tests for server.ts
 *
 * NOTE: server.ts is a singleton — it reads NODE_ENV and caches env-dependent
 * config (intervals, secure-headers, loadLocalENV) at import time. This file
 * sets NODE_ENV='test' before importing it, so the in-process module is frozen
 * in test mode. Any assertion about PRODUCTION config must spawn a child
 * process with NODE_ENV='production' (see server.prod-import.test.js) — never
 * assert prod behavior against the in-process import here.
 */
import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { promisify } from 'node:util';
import { mkdir, rm, writeFile, rename, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { databaseManager } from './adapters/manager.ts';

process.env.SKIP_SERVER_START = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
process.env.STRIPE_KEY = process.env.STRIPE_KEY || 'sk_test_fake';
process.env.STRIPE_ENDPOINT_SECRET = process.env.STRIPE_ENDPOINT_SECRET || 'whsec_test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = './databases/server-integration-test.db';
process.env.FREE_USAGE_LIMIT = '5';

const {
  app,
  db,
  setStripeForTests,
  csrfTokenStore,
  loginAttemptStore,
  jwtSign,
  generateUUID,
  generateCSRFToken,
  hashPassword,
  csrfProtection,
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
  isMainModule,
  __testShouldStartServer,
  __testResolvePort,
  __testRunCsrfCleanup,
  __testRunLockoutCleanup,
  __testRunProdHourlyTask,
  __testLoadApplicationConfig,
  __testWarnStripeDisabled,
  __testOnServerStarted,
  __testGracefulShutdown,
  __testRegisterGracefulShutdown,
  __testRegisterCsrfInterval,
  __testRegisterLockoutInterval,
  __testRegisterProdHourlyInterval,
  __testRegisterCsrfIntervalIfStarted,
  __testRegisterLockoutIntervalIfStarted,
  __testMaybeRegisterProdHourlyInterval,
  buildSubscriptionPatch,
  __testBuildSecureHeadersOptions,
  __testApacheLogMiddleware,
  __testDevRequestLogMiddleware,
  __testStartHttpServer,
  __testStartHttpServerIfNeeded,
  __testSetServeFactory,
  __testInitializeStripe,
  __testSanitizeUserUpdateValue,
  __testResolveUsage,
  __testResolveActualCount,
  generateToken,
  authMiddleware,
  parseJsonBody,
  evictOldestEntries,
  logger,
  loadEnvFile,
  loadLocalENV,
  setAuthCookies,
  resolveCustomerEmail,
  applyUserPatch,
  escapeHtml,
  validateEmail,
  validatePassword,
  validateName,
  verifyPassword,
  needsRehash,
  tokenExpireTimestamp,
  config,
  shouldStartServer,
} = await import('./server.ts');

const scryptAsync = promisify(crypto.scrypt);
const TEST_DB_PATH = './databases/server-integration-test.db';
const JWT_SECRET = process.env.JWT_SECRET;
const BACKEND_DIR = resolve(fileURLToPath(import.meta.url), '..');
const CONFIG_PATH = resolve(BACKEND_DIR, 'config.json');
const CONFIG_BACKUP = resolve(BACKEND_DIR, 'config.json.lifecycle-bak');

const TEST_USER = {
  name: 'Lifecycle User',
  email: 'lifecycle@example.com',
  password: 'validpassword123',
};

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return undefined;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

async function request(method, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.cookies) {
    headers.set('Cookie', options.cookies);
  }
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const res = await app.fetch(req);
  const contentType = res.headers.get('content-type') || '';
  const json = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
  const text = json === null ? await res.text().catch(() => '') : null;
  return { status: res.status, json, text, headers: res.headers, cookies: res.headers.get('Set-Cookie') };
}

async function signupSession(user = TEST_USER) {
  const res = await request('POST', '/api/signup', { body: user });
  return {
    res,
    token: extractCookie(res.cookies, 'token'),
    csrfToken: extractCookie(res.cookies, 'csrf_token'),
    userId: res.json?.id,
  };
}

function spy(impl = () => {}) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
  fn.calls = calls;
  return fn;
}

function createMockContext(overrides = {}) {
  const headers = new Map(Object.entries(overrides.headers || {}));
  const store = new Map(Object.entries(overrides.store || {}));
  const response = { status: 200, body: null, headers: new Map() };
  const c = {
    req: {
      method: overrides.method || 'POST',
      path: overrides.path || '/api/me',
      header: (name) => headers.get(name.toLowerCase()) ?? headers.get(name),
      json: overrides.json || (async () => ({})),
    },
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    json: (body, status = 200) => {
      response.status = status;
      response.body = body;
      return response;
    },
    header: (name, value) => response.headers.set(name, value),
    res: response,
  };
  return { c, response };
}

async function clearDatabase() {
  await databaseManager.closeAll();
  await db.executeQuery({ query: 'DELETE FROM Auths' });
  await db.executeQuery({ query: 'DELETE FROM Users' });
  await db.executeQuery({ query: 'DELETE FROM WebhookEvents' });
}

const dbMethodSnapshot = {
  insertAuth: db.insertAuth,
  executeQuery: db.executeQuery,
  findUser: db.findUser,
  findAuth: db.findAuth,
  updateAuth: db.updateAuth,
  updateUser: db.updateUser,
  findWebhookEvent: db.findWebhookEvent,
};

before(async () => {
  await mkdir('./databases', { recursive: true });
});

beforeEach(async () => {
  Object.assign(db, dbMethodSnapshot);
  csrfTokenStore.clear();
  loginAttemptStore.clear();
  await clearDatabase();
});

after(async () => {
  await databaseManager.closeAll();
  await rm(TEST_DB_PATH, { force: true });
  await rm(`${TEST_DB_PATH}-wal`, { force: true });
  await rm(`${TEST_DB_PATH}-shm`, { force: true });
});

describe('re-exported server helpers', () => {
  it('exposes auth and env helpers from the server module', async () => {
    // loadEnvFile/loadLocalENV mutate the shared process.env. An app's .env.example may
    // carry `STRIPE_ENDPOINT_SECRET=` (empty) — loading it would clobber the test's value
    // and 503 every later Stripe test. Snapshot and restore so this stays hermetic.
    const envSnapshot = { ...process.env };
    try {
      assert.doesNotThrow(() => loadEnvFile(resolve(BACKEND_DIR, '.env.example')));
      assert.doesNotThrow(() => loadLocalENV());
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in envSnapshot)) delete process.env[k];
      Object.assign(process.env, envSnapshot);
    }
    const { c } = createMockContext({ method: 'GET', path: '/api/me' });
    const csrf = setAuthCookies(c, 'user-1', jwtSign({ userID: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET));
    assert.equal(csrf.length, 64);
    setStripeForTests({
      customers: { retrieve: async () => ({ email: 'Helper@Test.com' }) },
    });
    assert.equal(await resolveCustomerEmail('cus_helper'), 'helper@test.com');
    const patchUserId = generateUUID();
    await db.insertUser({
      _id: patchUserId,
      email: 'helper-patch@example.com',
      name: 'Helper',
      created_at: Date.now(),
    });
    assert.equal(await applyUserPatch('helper-patch@example.com', { name: 'Patched' }), true);
    assert.equal(escapeHtml('<'), '&lt;');
    assert.ok(validateEmail('helper@example.com'));
    assert.ok(validatePassword('password1'));
    assert.ok(validateName('Helper'));
    assert.ok(tokenExpireTimestamp() > Math.floor(Date.now() / 1000));
    assert.equal(needsRehash('$2$abc'), true);
    const hash = await hashPassword('password1');
    assert.ok(await verifyPassword('password1', hash));
    assert.ok(config.database);
    assert.equal(shouldStartServer, false);
  });
});

describe('usage helpers', () => {
  it('resolves usage defaults and actual counts', () => {
    assert.deepEqual(__testResolveUsage({}), { count: 0, reset_at: null });
    assert.deepEqual(__testResolveUsage({ usage: { count: 2, reset_at: 9 } }), { count: 2, reset_at: 9 });
    assert.equal(__testResolveActualCount(null), 1);
    assert.equal(__testResolveActualCount({ usage: { count: 0 } }), 1);
    assert.equal(__testResolveActualCount({ usage: { count: 5 } }), 5);
  });
});

describe('port resolution', () => {
  it('uses PORT env when set and defaults to 8000', () => {
    assert.equal(__testResolvePort({}), 8000);
    assert.equal(__testResolvePort({ PORT: '8123' }), 8123);
  });
});

describe('shouldStartServer', () => {
  it('combines SKIP_SERVER_START and main-module detection', () => {
    const serverPath = resolve(dirname(fileURLToPath(import.meta.url)), 'server.ts');
    const serverUrl = pathToFileURL(serverPath).href;
    const originalArgv = process.argv[1];
    process.argv[1] = serverPath;
    assert.equal(__testShouldStartServer('1', serverUrl), false);
    assert.equal(__testShouldStartServer('0', serverUrl), true);
    assert.equal(__testShouldStartServer(process.env.SKIP_SERVER_START, serverUrl), false);
    process.argv[1] = originalArgv;
  });
});

describe('isMainModule', () => {
  it('returns false when argv entry is missing', () => {
    const original = process.argv[1];
    delete process.argv[1];
    assert.equal(isMainModule(import.meta.url), false);
    process.argv[1] = original;
  });

  it('returns true when module url matches argv entry', () => {
    const entry = fileURLToPath(import.meta.url);
    const original = process.argv[1];
    process.argv[1] = entry;
    assert.equal(isMainModule(import.meta.url), true);
    process.argv[1] = original;
  });
});

describe('interval and maintenance hooks', () => {
  it('runs CSRF cleanup and LRU eviction', () => {
    const oldTs = Date.now() - (25 * 60 * 60 * 1000);
    csrfTokenStore.set('expired', { token: 'a', timestamp: oldTs });
    csrfTokenStore.set('fresh', { token: 'b', timestamp: Date.now() });
    for (let i = 0; i < 50001; i++) {
      csrfTokenStore.set(`bulk-${i}`, { token: `t${i}`, timestamp: i });
    }
    __testRunCsrfCleanup();
    assert.ok(!csrfTokenStore.has('expired'));
  });

  it('runs lockout cleanup and LRU eviction', () => {
    const past = Date.now() - 1000;
    loginAttemptStore.set('expired@example.com', { attempts: 5, lockedUntil: past });
    loginAttemptStore.set('active@example.com', { attempts: 1, lockedUntil: Date.now() + 60000 });
    for (let i = 0; i < 50001; i++) {
      loginAttemptStore.set(`bulk${i}@x.com`, { attempts: 1, lockedUntil: i });
    }
    __testRunLockoutCleanup();
    assert.ok(!loginAttemptStore.has('expired@example.com'));
  });

  it('runs production hourly task logger', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      __testRunProdHourlyTask();
      assert.ok(logs.some((line) => line.includes('Hourly task completed')));
    } finally {
      console.log = original;
    }
  });
});

describe('config and stripe hooks', () => {
  it('returns fallback config when config.json cannot be read', async () => {
    await rename(CONFIG_PATH, CONFIG_BACKUP);
    try {
      const loaded = await __testLoadApplicationConfig();
      assert.equal(loaded.database.dbType, 'sqlite');
      assert.equal(loaded.database.connectionString, TEST_DB_PATH);
    } finally {
      await rename(CONFIG_BACKUP, CONFIG_PATH);
    }
  });

  it('uses config.json connection string when TEST_DATABASE_PATH is unset', async () => {
    const original = process.env.TEST_DATABASE_PATH;
    delete process.env.TEST_DATABASE_PATH;
    try {
      const loaded = await __testLoadApplicationConfig();
      // Assert against the app's OWN config.json, not a hardcoded canonical path — this
      // test ships to every app and their connectionString is app-owned (e.g. an app's
      // './backend/databases/<App>.db'). Hardcoding './databases/MyApp.db' failed on all.
      const expected = JSON.parse(await readFile(CONFIG_PATH, 'utf8')).database.connectionString;
      assert.equal(loaded.database.connectionString, expected);
    } finally {
      process.env.TEST_DATABASE_PATH = original;
    }
  });

  it('defaults staticDir when config omits staticDir', async () => {
    const original = process.env.TEST_DATABASE_PATH;
    delete process.env.TEST_DATABASE_PATH;
    const originalText = await readFile(CONFIG_PATH, 'utf8');
    const raw = JSON.parse(originalText);
    const trimmed = { database: raw.database };
    await writeFile(CONFIG_PATH, JSON.stringify(trimmed));
    try {
      const loaded = await __testLoadApplicationConfig();
      assert.equal(loaded.staticDir, '../dist');
    } finally {
      // Restore the original bytes verbatim — re-stringifying `raw` would drop
      // the file's pretty-printing and trailing newline, dirtying the tree.
      await writeFile(CONFIG_PATH, originalText);
      process.env.TEST_DATABASE_PATH = original;
    }
  });

  it('uses default sqlite path in fallback when TEST_DATABASE_PATH is unset', async () => {
    const original = process.env.TEST_DATABASE_PATH;
    delete process.env.TEST_DATABASE_PATH;
    await rename(CONFIG_PATH, CONFIG_BACKUP);
    try {
      const loaded = await __testLoadApplicationConfig();
      assert.equal(loaded.database.connectionString, './databases/MyApp.db');
    } finally {
      await rename(CONFIG_BACKUP, CONFIG_PATH);
      process.env.TEST_DATABASE_PATH = original;
    }
  });

  it('warns when stripe is disabled', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      __testWarnStripeDisabled();
      assert.ok(warnings.some((w) => w.includes('STRIPE_KEY not set')));
    } finally {
      console.warn = originalWarn;
    }
  });

  it('logs server started callback for development and production', () => {
    const logs = [];
    const original = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      __testOnServerStarted({ port: 8000 });
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      __testOnServerStarted({ port: 9000 });
      process.env.NODE_ENV = originalEnv;
      assert.ok(logs.some((line) => line.includes('Server started successfully')));
      assert.ok(logs.some((line) => line.includes('production')));
    } finally {
      console.log = original;
    }
  });
});

describe('graceful shutdown hooks', () => {
  it('uses default shutdown options when none are provided', async () => {
    const exits = [];
    const timeouts = [];
    const originalExit = process.exit;
    const originalSetTimeout = globalThis.setTimeout;
    process.exit = (code) => { exits.push(code); };
    globalThis.setTimeout = (fn, ms) => {
      timeouts.push(ms);
      return 1;
    };
    const mockServer = { close: (cb) => { void cb(); } };
    try {
      __testGracefulShutdown(mockServer, 'SIGTERM');
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      assert.deepEqual(exits, [0]);
      assert.deepEqual(timeouts, [10000]);
    } finally {
      process.exit = originalExit;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('invokes default force-exit timeout callback', async () => {
    const exits = [];
    const errors = [];
    const originalExit = process.exit;
    const originalError = console.error;
    const originalSetTimeout = globalThis.setTimeout;
    process.exit = (code) => { exits.push(code); };
    console.error = (...args) => errors.push(args.join(' '));
    globalThis.setTimeout = (fn) => {
      fn();
      return 1;
    };
    try {
      __testGracefulShutdown({ close: (cb) => { void cb(); } }, 'SIGTERM');
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      assert.ok(exits.includes(0));
      assert.ok(exits.includes(1));
      assert.ok(errors.some((line) => line.includes('Forced shutdown after timeout')));
    } finally {
      process.exit = originalExit;
      console.error = originalError;
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  it('forces exit when graceful shutdown times out', () => {
    const exits = [];
    const errors = [];
    let forceFn;
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      __testGracefulShutdown({ close: () => {} }, 'SIGINT', {
        exit: (code) => exits.push(code),
        setForceExitTimeout: (fn) => { forceFn = fn; },
      });
      forceFn();
      assert.deepEqual(exits, [1]);
      assert.ok(errors.some((line) => line.includes('Forced shutdown after timeout')));
    } finally {
      console.error = originalError;
    }
  });

  it('registers SIGTERM and SIGINT handlers', async () => {
    const handlers = {};
    const exits = [];
    const originalOn = process.on;
    process.on = (signal, handler) => { handlers[signal] = handler; };
    const mockServer = { close: (cb) => cb() };
    const originalExit = process.exit;
    process.exit = (code) => exits.push(code);
    try {
      __testRegisterGracefulShutdown(mockServer);
      handlers.SIGTERM();
      handlers.SIGINT();
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      assert.deepEqual(exits, [0, 0]);
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }
  });

  it('logs database close errors during shutdown', async () => {
    const errors = [];
    const originalCloseAll = databaseManager.closeAll;
    const originalError = console.error;
    databaseManager.closeAll = async () => { throw new Error('db close failed'); };
    console.error = (...args) => errors.push(args.join(' '));
    const mockServer = { close: (cb) => cb() };
    try {
      __testGracefulShutdown(mockServer, 'SIGTERM', {
        exit: () => {},
        setForceExitTimeout: () => {},
      });
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      assert.ok(errors.some((line) => line.includes('db close failed')));
    } finally {
      databaseManager.closeAll = originalCloseAll;
      console.error = originalError;
    }
  });

  it('awaits async close callback during shutdown', async () => {
    let closeSettled = false;
    const mockServer = {
      close: async (cb) => {
        await cb();
        closeSettled = true;
      },
    };
    __testGracefulShutdown(mockServer, 'SIGTERM', {
      exit: () => {},
      setForceExitTimeout: () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(closeSettled, true);
  });

  it('closes server and database connections', async () => {
    const messages = [];
    const exits = [];
    const mockServer = {
      close: (cb) => cb(),
    };
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => messages.push(args.join(' '));
    console.error = (...args) => messages.push(args.join(' '));

    try {
      __testGracefulShutdown(mockServer, 'SIGTERM', {
        exit: (code) => exits.push(code),
        setForceExitTimeout: () => {},
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(messages.some((m) => m.includes('SIGTERM received')));
      assert.ok(messages.some((m) => m.includes('Server closed')));
      assert.ok(messages.some((m) => m.includes('Database connections closed')));
      assert.deepEqual(exits, [0]);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it('logs database close errors and schedules forced exit', async () => {
    const messages = [];
    const exits = [];
    const originalCloseAll = databaseManager.closeAll.bind(databaseManager);
    databaseManager.closeAll = async () => {
      throw new Error('close failed');
    };

    const mockServer = { close: (cb) => cb() };
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => messages.push(args.join(' '));
    console.error = (...args) => messages.push(args.join(' '));

    try {
      __testGracefulShutdown(mockServer, 'SIGINT', {
        exit: (code) => exits.push(code),
        setForceExitTimeout: (fn) => fn(),
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(messages.some((m) => m.includes('Error closing database connections')));
      assert.ok(messages.some((m) => m.includes('Forced shutdown after timeout')));
      assert.deepEqual([...exits].sort(), [0, 1]);
    } finally {
      databaseManager.closeAll = originalCloseAll;
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it('registers signal handlers when process is defined', async () => {
    const listeners = new Map();
    const exits = [];
    const originalOn = process.on;
    const originalExit = process.exit;
    process.on = (event, handler) => {
      listeners.set(event, handler);
    };
    process.exit = (code) => { exits.push(code); };
    try {
      __testRegisterGracefulShutdown({ close: (cb) => { void cb(); } });
      assert.equal(typeof listeners.get('SIGTERM'), 'function');
      assert.equal(typeof listeners.get('SIGINT'), 'function');
      listeners.get('SIGTERM')();
      await new Promise((resolve) => queueMicrotask(resolve));
      await new Promise((resolve) => queueMicrotask(resolve));
      assert.deepEqual(exits, [0]);
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }
  });
});

describe('CSRF protection branches', () => {
  it('skips validation for GET, signup, and signin', async () => {
    for (const path of ['/api/health', '/api/signup', '/api/signin']) {
      const { c } = createMockContext({ method: path === '/api/health' ? 'GET' : 'POST', path });
      let called = false;
      await csrfProtection(c, async () => { called = true; });
      assert.equal(called, true);
    }
  });

  it('rejects expired CSRF tokens', async () => {
    const userId = 'csrf-expired-user';
    const token = 'a'.repeat(64);
    csrfTokenStore.set(userId, { token, timestamp: Date.now() - (25 * 60 * 60 * 1000) });
    const { c, response } = createMockContext({
      headers: { 'x-csrf-token': token },
      store: { userID: userId },
    });
    await csrfProtection(c, async () => {});
    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'CSRF token expired');
    assert.ok(!csrfTokenStore.has(userId));
  });
});

describe('account lockout branches', () => {
  it('clears expired lock records via isAccountLocked', () => {
    const email = 'expired-lock@example.com';
    loginAttemptStore.set(email, { attempts: 5, lockedUntil: Date.now() - 1000 });
    const status = isAccountLocked(email);
    assert.equal(status.locked, false);
    assert.ok(!loginAttemptStore.has(email));
  });
});

describe('JWT and auth middleware branches', () => {
  it('returns 503 when JWT_SECRET is unset', async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    const { c, response } = createMockContext({ method: 'GET', path: '/api/me' });
    await authMiddleware(c, async () => {});
    assert.equal(response.status, 503);
    process.env.JWT_SECRET = original;
  });

  it('throws when generating token without JWT_SECRET', async () => {
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await assert.rejects(() => generateToken('user-1'), /JWT_SECRET not configured/);
    process.env.JWT_SECRET = original;
  });
});

describe('parseJsonBody', () => {
  it('rethrows non-syntax errors', async () => {
    const { c } = createMockContext({
      json: async () => { throw new TypeError('stream error'); },
    });
    await assert.rejects(() => parseJsonBody(c), /stream error/);
  });
});

describe('signup edge cases', () => {
  it('rolls back user when auth insert fails', async () => {
    const originalInsertAuth = db.insertAuth;
    db.insertAuth = async () => { throw new Error('auth insert failed'); };

    const res = await request('POST', '/api/signup', { body: TEST_USER });
    assert.equal(res.status, 500);
    const user = await db.findUser({ email: TEST_USER.email });
    assert.ok(user == null);

    db.insertAuth = originalInsertAuth;
  });

  it('logs rollback failure when compensating delete fails', async () => {
    const originalInsertAuth = db.insertAuth;
    const originalExecuteQuery = db.executeQuery;
    db.insertAuth = async () => { throw new Error('auth insert failed'); };
    db.executeQuery = async () => { throw new Error('rollback failed'); };

    const res = await request('POST', '/api/signup', { body: TEST_USER });
    assert.equal(res.status, 500);

    db.insertAuth = originalInsertAuth;
    db.executeQuery = originalExecuteQuery;
  });
});

describe('signin edge cases', () => {
  const LEGACY_BCRYPT_HASH = '$2b$10$gix5z78/st4CdQYVM8C4g.ygzzWZQ39pnLKhxVtMWK1HUeASfzIyG';

  it('returns subscription details on successful signin', async () => {
    const userId = generateUUID();
    await db.insertUser({
      _id: userId,
      email: TEST_USER.email,
      name: TEST_USER.name,
      created_at: Date.now(),
    });
    await db.insertAuth({ email: TEST_USER.email, password: await hashPassword(TEST_USER.password), userID: userId });
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_sub', expires: 9999999999, status: 'active' } },
    });

    const res = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.subscription.stripeID, 'cus_sub');
  });

  it('returns 401 when auth exists but user record is missing', async () => {
    const userId = generateUUID();
    await db.insertUser({ _id: userId, email: 'orphan@example.com', name: 'Orphan', created_at: Date.now() });
    await db.insertAuth({ email: 'orphan@example.com', password: await hashPassword('validpassword123'), userID: userId });
    const originalFindUser = db.findUser;
    db.findUser = async (query) => {
      if (query.email === 'orphan@example.com') return null;
      return originalFindUser(query);
    };
    const res = await request('POST', '/api/signin', {
      body: { email: 'orphan@example.com', password: 'validpassword123' },
    });
    db.findUser = originalFindUser;
    assert.equal(res.status, 401);
  });

  it('continues signin when password rehash fails', async () => {
    const userId = generateUUID();
    await db.insertUser({ _id: userId, email: 'rehash@example.com', name: 'Rehash', created_at: Date.now() });
    await db.insertAuth({ email: 'rehash@example.com', password: LEGACY_BCRYPT_HASH, userID: userId });
    const originalUpdateAuth = db.updateAuth;
    db.updateAuth = async () => { throw new Error('rehash failed'); };

    const res = await request('POST', '/api/signin', {
      body: { email: 'rehash@example.com', password: 'validpassword123' },
    });
    assert.equal(res.status, 200);

    db.updateAuth = originalUpdateAuth;
  });

  it('handles signin server errors', async () => {
    const originalFindAuth = db.findAuth;
    db.findAuth = async () => { throw new Error('db down'); };
    const res = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(res.status, 500);
    db.findAuth = originalFindAuth;
  });

  it('rejects signin when password is missing or not a string', async () => {
    const missing = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email },
    });
    assert.equal(missing.status, 400);
    assert.equal(missing.json.error, 'Invalid credentials');

    const numeric = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: 12345 },
    });
    assert.equal(numeric.status, 400);
    assert.equal(numeric.json.error, 'Invalid credentials');
  });
});

describe('signout edge cases', () => {
  it('handles signout server errors', async () => {
    const { token, userId } = await signupSession();
    const originalDelete = csrfTokenStore.delete;
    csrfTokenStore.delete = () => { throw new Error('store error'); };
    const res = await request('POST', '/api/signout', { cookies: `token=${token}` });
    assert.equal(res.status, 500);
    csrfTokenStore.delete = originalDelete;
    csrfTokenStore.delete(userId);
  });
});

describe('PUT /api/me edge cases', () => {
  it('rejects updates with no valid fields', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { hacker: 'x' },
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /No valid fields/);
  });

  it('rejects when no changes are made', async () => {
    const { token, csrfToken, userId } = await signupSession();
    const originalUpdateUser = db.updateUser;
    db.updateUser = async () => ({ modifiedCount: 0 });
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { name: 'Same Name' },
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /No changes made/);
    db.updateUser = originalUpdateUser;
  });

  it('handles update errors', async () => {
    const { token, csrfToken } = await signupSession();
    const originalFindUser = db.findUser;
    db.findUser = async (q) => {
      if (q._id) throw new Error('update failed');
      return originalFindUser(q);
    };
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { name: 'Broken' },
    });
    assert.equal(res.status, 500);
    db.findUser = originalFindUser;
  });
});

describe('POST /api/usage edge cases', () => {
  it('returns 429 when usage limit is exceeded on track', async () => {
    const originalLimit = process.env.FREE_USAGE_LIMIT;
    process.env.FREE_USAGE_LIMIT = '5';
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await db.executeQuery({
      query: 'UPDATE Users SET usage_count = ?, usage_reset_at = ? WHERE _id = ?',
      params: [5, future, userId],
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'track' },
    });
    process.env.FREE_USAGE_LIMIT = originalLimit;
    assert.equal(res.status, 429);
    assert.match(res.json.error, /Usage limit reached/);
  });

  it('includes subscription details for free users with subscription metadata', async () => {
    const { token, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_free', expires: 1, status: 'canceled' } },
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.subscription.status, 'canceled');
    assert.ok(res.json.subscription.expiresAt);
  });

  it('handles usage tracking errors', async () => {
    const { token } = await signupSession();
    const originalFindUser = db.findUser;
    db.findUser = async () => { throw new Error('usage db error'); };
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 500);
    db.findUser = originalFindUser;
  });

  it('rejects invalid usage operations', async () => {
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'bogus' },
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /Invalid operation/);
  });

  it('rejects usage requests with a missing operation', async () => {
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: {},
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /Invalid operation/);
  });
});

describe('checkout and portal edge cases', () => {
  it('returns 400 when stripe price lookup is empty', async () => {
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: { list: spy(() => ({ data: [] })) },
      checkout: { sessions: { create: spy() } },
    });
    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: TEST_USER.email, lookup_key: 'missing' },
    });
    assert.equal(res.status, 400);
  });

  it('handles checkout session errors', async () => {
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: { list: spy(() => ({ data: [{ id: 'price_1' }] })) },
      checkout: { sessions: { create: spy(() => { throw new Error('stripe down'); }) } },
    });
    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: TEST_USER.email, lookup_key: 'pro' },
    });
    assert.equal(res.status, 500);
  });

  it('handles portal session errors', async () => {
    const { token, csrfToken, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_portal', expires: null, status: 'active' } },
    });
    setStripeForTests({
      billingPortal: { sessions: { create: spy(() => { throw new Error('portal down'); }) } },
    });
    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { customerID: 'cus_portal' },
    });
    assert.equal(res.status, 500);
  });
});

describe('SPA fallback with index.html', () => {
  const indexDir = resolve(BACKEND_DIR, '../dist');
  const indexPath = resolve(indexDir, 'index.html');
  const indexBackup = resolve(indexDir, 'index.html.lifecycle-bak');

  it('serves index.html when present for non-API routes', async () => {
    await mkdir(indexDir, { recursive: true });
    await writeFile(indexPath, '<html><body>SPA</body></html>');
    const res = await request('GET', '/dashboard');
    assert.equal(res.status, 200);
    assert.ok(res.text?.includes('SPA'));
  });

  it('returns welcome text when index.html cannot be read', async () => {
    await mkdir(indexDir, { recursive: true });
    try {
      await rename(indexPath, indexBackup);
    } catch {
      // index may not exist
    }
    const res = await request('GET', '/spa-missing-index');
    assert.equal(res.status, 200);
    assert.ok(res.text?.includes('Welcome to Skateboard API'));
    try {
      await rename(indexBackup, indexPath);
    } catch {
      // restored on next test if needed
    }
  });
});

describe('Stripe webhook processing errors', () => {
  it('returns 500 when webhook processing throws', async () => {
    const originalFindWebhookEvent = db.findWebhookEvent;
    db.findWebhookEvent = async () => { throw new Error('db error'); };
    setStripeForTests({
      webhooks: {
        constructEventAsync: spy(() => ({
          id: 'evt_err',
          type: 'invoice.paid',
          data: { object: {} },
        })),
      },
    });
    const req = new Request('http://localhost/api/payment', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig', 'Content-Type': 'application/json' },
      body: '{}',
    });
    const res = await app.fetch(req);
    assert.equal(res.status, 500);
    db.findWebhookEvent = originalFindWebhookEvent;
  });
});

describe('remaining server branches', () => {
  it('resolves custom and default CORS origins', async () => {
    const { __testResolveCorsOrigins } = await import('./server.ts');
    assert.deepEqual(
      __testResolveCorsOrigins({ CORS_ORIGINS: 'https://a.test, https://b.test' }),
      ['https://a.test', 'https://b.test'],
    );
    assert.ok(__testResolveCorsOrigins({}).includes('http://localhost:5173'));
  });

  it('hides internal error details when NODE_ENV is production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request('GET', '/api/__integration_error_test__');
    process.env.NODE_ENV = original;
    assert.equal(res.status, 500);
    assert.equal(res.json.error, 'Internal server error');
    assert.equal(res.json.stack, undefined);
  });

  it('returns 500 for unexpected signup failures', async () => {
    const originalInsertUser = db.insertUser;
    db.insertUser = async () => { throw new Error('db exploded'); };
    const res = await request('POST', '/api/signup', { body: TEST_USER });
    db.insertUser = originalInsertUser;
    assert.equal(res.status, 500);
    assert.equal(res.json.error, 'Server error');
  });

  it('uses FRONTEND_URL for checkout success and cancel URLs', async () => {
    const originalFrontend = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: { list: spy(() => ({ data: [{ id: 'price_1' }] })) },
      checkout: {
        sessions: {
          create: spy((session) => {
            assert.ok(session.success_url.startsWith('https://app.example.com/'));
            assert.ok(session.cancel_url.startsWith('https://app.example.com/'));
            return { url: 'https://checkout.test', id: 'cs_1', customer: 'cus_1' };
          }),
        },
      },
    });
    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: TEST_USER.email, lookup_key: 'pro' },
    });
    process.env.FRONTEND_URL = originalFrontend;
    assert.equal(res.status, 200);
  });

  it('returns 404 from /api/me when user record disappears', async () => {
    const { token } = await signupSession();
    const originalFindUser = db.findUser;
    db.findUser = async (query) => (query._id ? null : originalFindUser(query));
    const res = await request('GET', '/api/me', { cookies: `token=${token}` });
    db.findUser = originalFindUser;
    assert.equal(res.status, 404);
  });

  it('returns 404 from PUT /api/me when user record disappears', async () => {
    const { token, csrfToken } = await signupSession();
    const originalFindUser = db.findUser;
    db.findUser = async (query) => (query._id ? null : originalFindUser(query));
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { name: 'Ghost' },
    });
    db.findUser = originalFindUser;
    assert.equal(res.status, 404);
  });

  it('returns 404 from /api/usage when user record disappears', async () => {
    const { token } = await signupSession();
    const originalFindUser = db.findUser;
    db.findUser = async (query) => (query._id ? null : originalFindUser(query));
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    db.findUser = originalFindUser;
    assert.equal(res.status, 404);
  });

  it('treats expired subscriptions as non-subscriber usage', async () => {
    const { token, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_expired', expires: 1, status: 'active' } },
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.isSubscriber, false);
  });

  it('uses request Origin header for checkout when FRONTEND_URL is unset', async () => {
    const originalFrontend = process.env.FRONTEND_URL;
    delete process.env.FRONTEND_URL;
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: { list: spy(() => ({ data: [{ id: 'price_origin' }] })) },
      checkout: {
        sessions: {
          create: spy((session) => {
            assert.ok(session.success_url.startsWith('https://origin.client.test/'));
            return { url: 'https://checkout.test', id: 'cs_origin', customer: 'cus_1' };
          }),
        },
      },
    });
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      Origin: 'https://origin.client.test',
    });
    headers.set('Cookie', `token=${token}`);
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: TEST_USER.email, lookup_key: 'pro' }),
    });
    const res = await app.fetch(req);
    process.env.FRONTEND_URL = originalFrontend;
    assert.equal(res.status, 200);
  });

  it('exposes generateCSRFToken for session cookie creation', () => {
    const token = generateCSRFToken();
    assert.equal(token.length, 64);
  });

  it('rejects checkout when email is missing', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { lookup_key: 'pro' },
    });
    assert.equal(res.status, 400);
  });

  it('defaults FREE_USAGE_LIMIT to 20 when env is unset', async () => {
    const originalLimit = process.env.FREE_USAGE_LIMIT;
    delete process.env.FREE_USAGE_LIMIT;
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    process.env.FREE_USAGE_LIMIT = originalLimit;
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 20);
  });

  it('sanitizes non-string update values without HTML escaping', () => {
    assert.equal(__testSanitizeUserUpdateValue(42), 42);
    assert.equal(__testSanitizeUserUpdateValue(' hello '), 'hello');
  });

  it('resets usage when reset_at is in the past', async () => {
    const { token, userId } = await signupSession();
    const past = Math.floor(Date.now() / 1000) - 10;
    await db.executeQuery({
      query: 'UPDATE Users SET usage_count = ?, usage_reset_at = ? WHERE _id = ?',
      params: [9, past, userId],
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 0);
    assert.ok(res.json.remaining >= 0);
  });

  it('uses existing usage object without initializing defaults', async () => {
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await db.executeQuery({
      query: 'UPDATE Users SET usage_count = ?, usage_reset_at = ? WHERE _id = ?',
      params: [2, future, userId],
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 2);
  });

  it('uses existing usage object without default initialization', async () => {
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 7200;
    await db.updateUser({ _id: userId }, {
      $set: { usage: { count: 4, reset_at: future } },
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'track' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 5);
  });

  it('treats zero usage count as one when re-read after track', async () => {
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await db.executeQuery({
      query: 'UPDATE Users SET usage_count = ?, usage_reset_at = ? WHERE _id = ?',
      params: [0, future, userId],
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'track' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 1);
  });

  it('returns null expiresAt for free users with subscription lacking expires', async () => {
    const { token, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_no_exp', expires: null, status: 'canceled' } },
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.subscription.expiresAt, null);
  });

  it('rejects portal requests without customerID', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: {},
    });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /Missing customerID/);
  });

  it('rejects portal customerID that does not match subscription', async () => {
    const { token, csrfToken, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_mine', expires: null, status: 'active' } },
    });
    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { customerID: 'cus_other' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'Unauthorized customerID');
  });

  it('allows portal access when user has no subscription stripeID', async () => {
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      billingPortal: {
        sessions: {
          create: spy(() => ({ url: 'https://portal.test', id: 'bps_1' })),
        },
      },
    });
    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { customerID: 'cus_new' },
    });
    assert.equal(res.status, 200);
  });

  it('returns usage for subscribers without expiry timestamps', async () => {
    const { token, userId } = await signupSession();
    await db.updateUser({ _id: userId }, {
      $set: { subscription: { stripeID: 'cus_no_exp', expires: null, status: 'active' } },
    });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.isSubscriber, true);
    assert.equal(res.json.subscription.expiresAt, null);
  });
});

describe('evictOldestEntries integration', () => {
  it('is invoked from cleanup hooks', () => {
    assert.doesNotThrow(() => {
      __testRunCsrfCleanup();
      __testRunLockoutCleanup();
    });
  });
});

describe('exported auth helper functions', () => {
  it('invokes lockout helpers directly', () => {
    const email = 'helpers@example.com';
    recordFailedLogin(email);
    assert.equal(isAccountLocked(email).locked, false);
    clearFailedLogins(email);
    assert.equal(loginAttemptStore.has(email), false);
  });
});

describe('db facade wrappers', () => {
  it('invokes every database facade method', async () => {
    const userId = generateUUID();
    const email = 'facade@example.com';
    await db.insertUser({ _id: userId, email, name: 'Facade', created_at: Date.now() });
    await db.insertAuth({ email, password: 'hash', userID: userId });
    const projected = await db.findUser({ _id: userId }, { name: 1 });
    assert.equal(projected.name, 'Facade');
    assert.ok(await db.findAuth({ email }));
    await db.updateUser({ _id: userId }, { $set: { name: 'Updated Facade' } });
    await db.updateAuth({ email }, { password: 'hash2' });
    assert.equal(await db.findWebhookEvent('evt_facade_missing') ?? null, null);
    await db.insertWebhookEvent('evt_facade', 'test.event', Date.now());
    const queryResult = await db.executeQuery({ query: 'SELECT COUNT(*) AS count FROM Users WHERE _id = ?', params: [userId] });
    assert.equal(queryResult.success, true);
  });
});

describe('SPA fallback branches', () => {
  it('returns 404 for asset-like paths and unknown API routes', async () => {
    const asset = await request('GET', '/assets/missing-bundle.js');
    assert.equal(asset.status, 404);
    const api = await request('GET', '/api/not-a-real-endpoint');
    assert.equal(api.status, 404);
  });
});

describe('server registration hooks', () => {
  it('registers interval timers when startup is enabled', () => {
    const intervals = [];
    const original = globalThis.setInterval;
    globalThis.setInterval = (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    };
    try {
      __testRegisterCsrfInterval();
      __testRegisterLockoutInterval();
      __testRegisterProdHourlyInterval();
      __testRegisterCsrfIntervalIfStarted(true);
      __testRegisterLockoutIntervalIfStarted(true);
      __testMaybeRegisterProdHourlyInterval(true, true);
      __testMaybeRegisterProdHourlyInterval(false, false);
      assert.equal(intervals.length, 6);
      __testRegisterCsrfIntervalIfStarted(false);
      assert.equal(intervals.length, 6);
    } finally {
      globalThis.setInterval = original;
    }
  });

  it('invokes registered interval callbacks directly', () => {
    const intervals = [];
    const original = globalThis.setInterval;
    globalThis.setInterval = (fn) => {
      intervals.push(fn);
      return intervals.length;
    };
    try {
      __testRegisterCsrfInterval();
      __testRegisterLockoutInterval();
      __testRegisterProdHourlyInterval();
      assert.doesNotThrow(() => {
        for (const fn of intervals) {
          fn();
        }
      });
      assert.equal(intervals.length, 3);
    } finally {
      globalThis.setInterval = original;
    }
  });

  it('builds subscription patch from stripe objects', () => {
    const patch = buildSubscriptionPatch('cus_1', { current_period_end: 123, status: 'active' });
    assert.deepEqual(patch, { stripeID: 'cus_1', expires: 123, status: 'active' });
  });

  it('builds secure header options for dev and production', () => {
    assert.equal(__testBuildSecureHeadersOptions(false).strictTransportSecurity, false);
    assert.ok(__testBuildSecureHeadersOptions(true).strictTransportSecurity.includes('max-age'));
  });

  it('runs apache and dev request logging middleware directly', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    const c = {
      req: { method: 'GET', path: '/api/health' },
      res: { status: 200 },
    };
    try {
      await __testApacheLogMiddleware(c, async () => {});
      assert.ok(logs.some((line) => line.includes('GET /api/health')));
      await __testDevRequestLogMiddleware(c, async () => {}, false);
      await __testDevRequestLogMiddleware(c, async () => {}, true);
    } finally {
      console.log = originalLog;
    }
  });

  it('starts HTTP server via injectable serve function', () => {
    let captured;
    const mockServe = (options, onListen) => {
      captured = { options, onListen };
      onListen({ port: 8000 });
      return { close: () => {} };
    };
    assert.equal(__testStartHttpServerIfNeeded(false, mockServe), null);
    const httpServer = __testStartHttpServerIfNeeded(true, mockServe);
    assert.equal(captured.options.port, __testResolvePort());
    assert.equal(typeof captured.onListen, 'function');
    assert.ok(httpServer);
  });

  it('starts HTTP server directly via __testStartHttpServer', () => {
    let captured;
    const mockServe = (options, onListen) => {
      captured = { options, onListen };
      onListen({ port: 8001 });
      return { close: () => {} };
    };
    const httpServer = __testStartHttpServer(mockServe);
    assert.equal(captured.options.hostname, '::');
    assert.equal(typeof captured.options.fetch, 'function');
    assert.ok(httpServer);
  });

  it('sets and resets the injectable serve factory', () => {
    let called = false;
    const sentinel = (options, onListen) => {
      called = true;
      onListen({ port: 8003 });
      return { close: () => {} };
    };
    try {
      __testSetServeFactory(sentinel);
      __testStartHttpServer();
      assert.ok(called);
      const httpServer = __testStartHttpServerIfNeeded(true);
      assert.ok(httpServer);
    } finally {
      __testSetServeFactory(serve);
    }
    assert.equal(__testStartHttpServerIfNeeded(false), null);
  });

  it('starts HTTP server with default serve factory parameter', () => {
    let captured = false;
    const mockServe = (options, onListen) => {
      captured = true;
      onListen({ port: 8002 });
      return { close: () => {} };
    };
    try {
      __testSetServeFactory(mockServe);
      const httpServer = __testStartHttpServer();
      assert.ok(captured);
      assert.ok(httpServer);
    } finally {
      __testSetServeFactory(serve);
    }
  });

  it('initializes stripe as disabled when key is missing', () => {
    assert.equal(__testInitializeStripe(undefined), null);
  });

  it('initializes stripe client when key is provided', () => {
    const client = __testInitializeStripe('sk_test_initialize');
    assert.ok(client);
    assert.equal(typeof client.webhooks, 'object');
  });
});