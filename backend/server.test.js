/**
 * Server integration tests — exercises the real server.js implementation.
 *
 * Run with: node --experimental-test-module-mocks --test server.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import { databaseManager } from './adapters/manager.js';

// ==== ENV (must be set before importing server.js) ====
process.env.SKIP_SERVER_START = '1';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.STRIPE_KEY = 'sk_test_fake';
process.env.STRIPE_ENDPOINT_SECRET = 'whsec_test';
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_PATH = './databases/server-integration-test.db';
process.env.FREE_USAGE_LIMIT = '20';

const {
  app,
  db,
  config,
  stripe: originalStripe,
  setStripeForTests,
  csrfTokenStore,
  loginAttemptStore,
  jwtSign,
  generateUUID,
} = await import('./server.js');

const scryptAsync = promisify(crypto.scrypt);

const TEST_DB_PATH = process.env.TEST_DATABASE_PATH;
const JWT_SECRET = process.env.JWT_SECRET;
const TEST_USER = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'validpassword123',
};

// ==== HELPERS ====

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

  return {
    status: res.status,
    json,
    text,
    headers: res.headers,
    cookies: res.headers.get('Set-Cookie'),
  };
}

async function clearDatabase() {
  await databaseManager.closeAll();
  await db.executeQuery({ query: 'DELETE FROM Auths' });
  await db.executeQuery({ query: 'DELETE FROM Users' });
  await db.executeQuery({ query: 'DELETE FROM WebhookEvents' });
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

async function postWebhook(body = '{}', signature = 'test-sig') {
  const req = new Request('http://localhost/api/payment', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'Content-Type': 'application/json' },
    body,
  });
  return app.fetch(req);
}

// ==== SETUP ====

before(async () => {
  await mkdir('./databases', { recursive: true });
});

beforeEach(async () => {
  csrfTokenStore.clear();
  loginAttemptStore.clear();
  setStripeForTests(originalStripe);
  await clearDatabase();
});

after(async () => {
  await databaseManager.closeAll();
  await rm(TEST_DB_PATH, { force: true });
  await rm(`${TEST_DB_PATH}-wal`, { force: true });
  await rm(`${TEST_DB_PATH}-shm`, { force: true });
});

// ==== AUTH TESTS ====

describe('Authentication Flow', () => {
  describe('POST /api/signup', () => {
    it('creates user with valid inputs', async () => {
      const res = await request('POST', '/api/signup', { body: TEST_USER });
      assert.equal(res.status, 201);
      assert.equal(res.json.email, TEST_USER.email);
      assert.equal(res.json.name, TEST_USER.name);
      assert.ok(res.json.id);
      assert.ok(res.cookies?.includes('token='));
      assert.ok(res.cookies?.includes('csrf_token='));
    });

    it('rejects invalid email format', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, email: 'not-an-email' },
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('email'));
    });

    it('rejects password too short', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, password: '12345' },
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Password'));
    });

    it('rejects password too long', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, password: 'a'.repeat(73) },
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Password'));
    });

    it('rejects missing name', async () => {
      const res = await request('POST', '/api/signup', {
        body: { email: TEST_USER.email, password: TEST_USER.password },
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Name'));
    });

    it('rejects duplicate email for postgres-style duplicate key errors', async () => {
      const originalInsertUser = db.insertUser;
      db.insertUser = async () => {
        const err = new Error('duplicate key value violates unique constraint');
        throw err;
      };
      const res = await request('POST', '/api/signup', { body: TEST_USER });
      db.insertUser = originalInsertUser;
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Unable to create'));
    });

    it('rejects duplicate email', async () => {
      await request('POST', '/api/signup', { body: TEST_USER });
      const res = await request('POST', '/api/signup', { body: TEST_USER });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Unable to create'));
    });

    it('rejects invalid JSON body', async () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const req = new Request('http://localhost/api/signup', {
        method: 'POST',
        headers,
        body: 'not valid json',
      });
      const res = await app.fetch(req);
      assert.equal(res.status, 400);
    });
  });

  describe('POST /api/signin', () => {
    beforeEach(async () => {
      await request('POST', '/api/signup', { body: TEST_USER });
    });

    it('signs in with correct credentials', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: TEST_USER.password },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.email, TEST_USER.email);
      assert.ok(res.cookies?.includes('token='));
    });

    it('rejects non-existent email', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: 'nonexistent@example.com', password: 'password123' },
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid credentials');
    });

    it('rejects wrong password', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: 'wrongpassword' },
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid credentials');
    });

    it('rejects invalid email format', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: 'not-an-email', password: 'password123' },
      });
      assert.equal(res.status, 400);
    });

    it('rejects missing password', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email },
      });
      assert.equal(res.status, 400);
    });

    it('rejects invalid JSON body', async () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const req = new Request('http://localhost/api/signin', {
        method: 'POST',
        headers,
        body: 'not valid json',
      });
      const res = await app.fetch(req);
      assert.equal(res.status, 400);
    });
  });

  describe('Legacy bcrypt migration', () => {
    const LEGACY_BCRYPT_HASH = '$2b$10$gix5z78/st4CdQYVM8C4g.ygzzWZQ39pnLKhxVtMWK1HUeASfzIyG';
    const LEGACY_USER = {
      email: 'legacy@example.com',
      name: 'Legacy User',
      password: 'validpassword123',
    };

    async function seedLegacyUser() {
      const userId = generateUUID();
      await db.insertUser({
        _id: userId,
        email: LEGACY_USER.email,
        name: LEGACY_USER.name,
        created_at: Date.now(),
      });
      await db.insertAuth({
        email: LEGACY_USER.email,
        password: LEGACY_BCRYPT_HASH,
        userID: userId,
      });
      return userId;
    }

    it('signs in user with stored bcrypt hash', async () => {
      await seedLegacyUser();
      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: LEGACY_USER.password },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.email, LEGACY_USER.email);
    });

    it('rejects wrong password against bcrypt hash', async () => {
      await seedLegacyUser();
      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: 'wrongpassword' },
      });
      assert.equal(res.status, 401);
    });

    it('rehashes bcrypt hash to scrypt on successful login', async () => {
      await seedLegacyUser();
      const before = await db.findAuth({ email: LEGACY_USER.email });
      assert.ok(before.password.startsWith('$2'), 'fixture should be bcrypt');

      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: LEGACY_USER.password },
      });
      assert.equal(res.status, 200);

      const after = await db.findAuth({ email: LEGACY_USER.email });
      assert.ok(after.password.startsWith('scrypt$'), 'hash should be migrated to scrypt');

      const [, saltB64, keyB64] = after.password.split('$');
      const salt = Buffer.from(saltB64, 'base64url');
      const expected = Buffer.from(keyB64, 'base64url');
      const candidate = await scryptAsync(LEGACY_USER.password, salt, 64);
      assert.ok(
        expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate),
        'migrated scrypt hash must verify against original password',
      );
    });
  });

  describe('POST /api/signout', () => {
    it('signs out authenticated user', async () => {
      const { token } = await signupSession();
      const res = await request('POST', '/api/signout', {
        cookies: `token=${token}`,
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.message, 'Signed out successfully');
    });

    it('rejects unauthenticated request', async () => {
      const res = await request('POST', '/api/signout', {});
      assert.equal(res.status, 401);
    });
  });

  describe('CSRF Protection', () => {
    let token;
    let csrfToken;

    beforeEach(async () => {
      const session = await signupSession();
      token = session.token;
      csrfToken = session.csrfToken;
    });

    it('allows request with valid CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`,
        headers: { 'x-csrf-token': csrfToken },
        body: { name: 'Updated Name' },
      });
      assert.equal(res.status, 200);
    });

    it('rejects request with missing CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`,
        body: { name: 'Updated Name' },
      });
      assert.equal(res.status, 403);
      assert.ok(res.json.error.includes('CSRF'));
    });

    it('rejects request with wrong CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`,
        headers: { 'x-csrf-token': 'wrong-token' },
        body: { name: 'Updated Name' },
      });
      assert.equal(res.status, 403);
    });
  });

  describe('JWT Authentication', () => {
    it('allows request with valid token', async () => {
      const { token } = await signupSession();
      const signoutRes = await request('POST', '/api/signout', {
        cookies: `token=${token}`,
      });
      assert.equal(signoutRes.status, 200);
    });

    it('rejects request with missing token', async () => {
      const res = await request('POST', '/api/signout', {});
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Unauthorized');
    });

    it('rejects request with expired token', async () => {
      const expiredToken = jwtSign(
        { userID: 'test-user', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET,
      );
      const res = await request('POST', '/api/signout', {
        cookies: `token=${expiredToken}`,
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Token expired');
    });

    it('rejects request with invalid token', async () => {
      const res = await request('POST', '/api/signout', {
        cookies: 'token=invalid-token',
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid token');
    });
  });
});

// ==== ACCOUNT LOCKOUT ====

describe('Account lockout', () => {
  beforeEach(async () => {
    await request('POST', '/api/signup', { body: TEST_USER });
  });

  it('locks account after repeated failed signin attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: 'wrong-password' },
      });
      assert.equal(res.status, 401);
    }

    const locked = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(locked.status, 429);
    assert.ok(locked.json.error.includes('locked'));
    assert.ok(locked.headers.get('Retry-After'));
  });

  it('clears lockout after successful signin', async () => {
    for (let i = 0; i < 3; i++) {
      await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: 'wrong-password' },
      });
    }

    const ok = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(ok.status, 200);

    const after = await request('POST', '/api/signin', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    assert.equal(after.status, 200);
  });
});

// ==== CSRF AUTO-REGENERATE ====

describe('CSRF auto-regenerate', () => {
  it('regenerates CSRF token when store entry is missing', async () => {
    const { token, userId } = await signupSession();
    csrfTokenStore.delete(userId);

    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': 'stale-token' },
      body: { name: 'Regenerated CSRF' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.name, 'Regenerated CSRF');
    assert.ok(csrfTokenStore.has(userId));
    assert.ok(res.cookies?.includes('csrf_token='));
  });
});

// ==== HEALTH & USER ROUTES ====

describe('GET /api/health', () => {
  it('returns ok status with timestamp', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
    assert.ok(typeof res.json.timestamp === 'number');
  });
});

describe('GET /api/me', () => {
  it('returns authenticated user profile', async () => {
    const { token } = await signupSession();
    const res = await request('GET', '/api/me', { cookies: `token=${token}` });
    assert.equal(res.status, 200);
    assert.equal(res.json.email, TEST_USER.email);
    assert.equal(res.json.name, TEST_USER.name);
  });

  it('rejects unauthenticated request', async () => {
    const res = await request('GET', '/api/me');
    assert.equal(res.status, 401);
  });
});

describe('PUT /api/me', () => {
  it('updates user name with valid CSRF token', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { name: 'New Display Name' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.name, 'New Display Name');
  });

  it('rejects invalid name', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('PUT', '/api/me', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { name: '' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.json.error.includes('Name'));
  });
});

// ==== USAGE ====

describe('POST /api/usage', () => {
  it('returns usage info for check operation', async () => {
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.remaining, 20);
    assert.equal(res.json.total, 20);
    assert.equal(res.json.isSubscriber, false);
  });

  it('increments usage for track operation', async () => {
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'track' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 1);
    assert.equal(res.json.remaining, 19);
  });

  it('tracks against pre-existing usage without re-initializing defaults', async () => {
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await db.updateUser({ _id: userId }, { $set: { usage: { count: 3, reset_at: future } } });
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'track' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.used, 4);
    assert.equal(res.json.remaining, 16);
  });

  it('rejects invalid operation', async () => {
    const { token } = await signupSession();
    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'invalid' },
    });
    assert.equal(res.status, 400);
  });

  it('returns unlimited usage for active subscribers', async () => {
    const { token, userId } = await signupSession();
    const future = Math.floor(Date.now() / 1000) + 86400;
    await db.updateUser(
      { _id: userId },
      { $set: { subscription: { stripeID: 'cus_sub', expires: future, status: 'active' } } },
    );

    const res = await request('POST', '/api/usage', {
      cookies: `token=${token}`,
      body: { operation: 'check' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.isSubscriber, true);
    assert.equal(res.json.remaining, -1);
  });
});

// ==== CHECKOUT & PORTAL ====

describe('POST /api/checkout', () => {
  it('creates checkout session for authenticated user', async () => {
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: {
        list: spy(() => ({ data: [{ id: 'price_123' }] })),
      },
      checkout: {
        sessions: {
          create: spy(() => ({
            url: 'https://checkout.stripe.test/session',
            id: 'cs_test_1',
            customer: 'cus_new',
          })),
        },
      },
    });

    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: TEST_USER.email, lookup_key: 'pro_monthly' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.url, 'https://checkout.stripe.test/session');
    assert.equal(res.json.id, 'cs_test_1');
  });

  it('rejects email mismatch', async () => {
    const { token, csrfToken } = await signupSession();
    setStripeForTests({
      prices: { list: spy() },
      checkout: { sessions: { create: spy() } },
    });

    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: 'other@example.com', lookup_key: 'pro_monthly' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'Email mismatch');
  });

  it('rejects missing lookup_key', async () => {
    const { token, csrfToken } = await signupSession();
    const res = await request('POST', '/api/checkout', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { email: TEST_USER.email },
    });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/portal', () => {
  it('creates billing portal session for matching customer', async () => {
    const { token, csrfToken, userId } = await signupSession();
    await db.updateUser(
      { _id: userId },
      { $set: { subscription: { stripeID: 'cus_portal', expires: null, status: 'active' } } },
    );

    setStripeForTests({
      billingPortal: {
        sessions: {
          create: spy(() => ({
            url: 'https://billing.stripe.test/portal',
            id: 'bps_test_1',
          })),
        },
      },
    });

    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { customerID: 'cus_portal' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.url, 'https://billing.stripe.test/portal');
  });

  it('rejects unauthorized customerID', async () => {
    const { token, csrfToken, userId } = await signupSession();
    await db.updateUser(
      { _id: userId },
      { $set: { subscription: { stripeID: 'cus_mine', expires: null, status: 'active' } } },
    );
    setStripeForTests({
      billingPortal: { sessions: { create: spy() } },
    });

    const res = await request('POST', '/api/portal', {
      cookies: `token=${token}`,
      headers: { 'x-csrf-token': csrfToken },
      body: { customerID: 'cus_other' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'Unauthorized customerID');
  });
});

// ==== ERROR HANDLER & SPA FALLBACK ====

describe('Error handler', () => {
  it('returns JSON error for unhandled exceptions', async () => {
    const res = await request('GET', '/api/__integration_error_test__');
    assert.equal(res.status, 500);
    assert.equal(res.json.error, 'Intentional integration test error');
    assert.ok(res.json.stack);
  });
});

describe('SPA fallback', () => {
  it('returns welcome text when index.html is unavailable', async () => {
    const res = await request('GET', '/app/dashboard');
    assert.equal(res.status, 200);
    assert.ok(
      res.text?.includes('Welcome to Skateboard API') || res.text?.includes('<html'),
      'expected SPA fallback response',
    );
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await request('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
  });
});

// ==== STRIPE WEBHOOK ====

describe('Stripe Webhook', () => {
  function installStripeMock(overrides = {}) {
    const stripeMock = {
      webhooks: {
        constructEventAsync: spy(() => ({
          id: 'evt_default',
          type: 'invoice.paid',
          data: { object: {} },
        })),
      },
      customers: { retrieve: spy(() => ({ email: 'user@example.com' })) },
      subscriptions: { retrieve: spy(() => ({ current_period_end: 1, status: 'active' })) },
      ...overrides,
    };
    setStripeForTests(stripeMock);
    return stripeMock;
  }

  async function seedUser(email = 'user@example.com') {
    const userId = generateUUID();
    await db.insertUser({
      _id: userId,
      email,
      name: 'Webhook User',
      created_at: Date.now(),
    });
    await db.insertAuth({ email, password: 'hash', userID: userId });
    return userId;
  }

  it('returns 400 when signature verification fails', async () => {
    installStripeMock({
      webhooks: {
        constructEventAsync: spy(() => {
          throw new Error('bad sig');
        }),
      },
    });
    const res = await postWebhook();
    assert.equal(res.status, 400);
    const events = await db.executeQuery({ query: 'SELECT * FROM WebhookEvents' });
    assert.equal(events.rowCount, 0);
  });

  it('skips and returns 200 when event already processed (idempotency)', async () => {
    await db.insertWebhookEvent('evt_123', 'invoice.paid', Date.now());
    installStripeMock({
      webhooks: {
        constructEventAsync: spy(() => ({
          id: 'evt_123',
          type: 'invoice.paid',
          data: { object: {} },
        })),
      },
    });
    const res = await postWebhook();
    assert.equal(res.status, 200);
    const events = await db.executeQuery({ query: 'SELECT * FROM WebhookEvents' });
    assert.equal(events.rowCount, 1);
  });

  it('records event before processing to prevent races', async () => {
    await seedUser();
    installStripeMock({
      webhooks: {
        constructEventAsync: spy(() => ({
          id: 'evt_1',
          type: 'customer.subscription.updated',
          data: { object: { customer: 'cus_1', current_period_end: 1700000000, status: 'active' } },
        })),
      },
      customers: {
        retrieve: spy(async () => {
          const pending = await db.findWebhookEvent('evt_1');
          assert.ok(pending, 'event must be recorded before customer lookup');
          return { email: 'user@example.com' };
        }),
      },
    });

    const res = await postWebhook();
    assert.equal(res.status, 200);
  });

  describe('customer.subscription.* events', () => {
    it('updates user subscription on customer.subscription.created', async () => {
      await seedUser('created@example.com');
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_created',
            type: 'customer.subscription.created',
            data: { object: { customer: 'cus_created', current_period_end: 1800000001, status: 'trialing' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'created@example.com' })) },
      });
      const res = await postWebhook();
      assert.equal(res.status, 200);
      const user = await db.findUser({ email: 'created@example.com' });
      assert.equal(user.subscription.status, 'trialing');
    });

    it('updates user subscription on customer.subscription.deleted', async () => {
      await seedUser('deleted@example.com');
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_deleted',
            type: 'customer.subscription.deleted',
            data: { object: { customer: 'cus_deleted', current_period_end: 1, status: 'canceled' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'deleted@example.com' })) },
      });
      const res = await postWebhook();
      assert.equal(res.status, 200);
      const user = await db.findUser({ email: 'deleted@example.com' });
      assert.equal(user.subscription.status, 'canceled');
    });

    it('updates user subscription on customer.subscription.updated', async () => {
      await seedUser('user@example.com');
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_1',
            type: 'customer.subscription.updated',
            data: { object: { customer: 'cus_42', current_period_end: 1800000000, status: 'active' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'user@example.com' })) },
      });

      const res = await postWebhook();
      assert.equal(res.status, 200);
      const user = await db.findUser({ email: 'user@example.com' });
      assert.deepEqual(user.subscription, {
        stripeID: 'cus_42',
        expires: 1800000000,
        status: 'active',
      });
    });

    it('normalizes email to lowercase before lookup', async () => {
      await seedUser('mixed@case.com');
      const stripeMock = installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_2',
            type: 'customer.subscription.updated',
            data: { object: { customer: 'cus_42', current_period_end: 1800000000, status: 'active' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'Mixed@Case.COM' })) },
      });

      await postWebhook();
      const user = await db.findUser({ email: 'mixed@case.com' });
      assert.ok(user.subscription);
      assert.equal(stripeMock.customers.retrieve.calls.length, 1);
    });

    it('returns 400 when customer ID is missing', async () => {
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_x',
            type: 'customer.subscription.created',
            data: { object: { current_period_end: 1, status: 'active' } },
          })),
        },
      });
      const res = await postWebhook();
      assert.equal(res.status, 400);
    });

    it('returns 400 when stripe customer has no email', async () => {
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_3',
            type: 'customer.subscription.updated',
            data: { object: { customer: 'cus_42', current_period_end: 1, status: 'active' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: null })) },
      });
      const res = await postWebhook();
      assert.equal(res.status, 400);
    });

    it('returns 200 and does not patch when user is unknown', async () => {
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_sub_4',
            type: 'customer.subscription.updated',
            data: { object: { customer: 'cus_42', current_period_end: 1, status: 'active' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'unknown@example.com' })) },
      });
      const res = await postWebhook();
      assert.equal(res.status, 200);
      const user = await db.findUser({ email: 'unknown@example.com' });
      assert.ok(!user);
    });
  });

  describe('checkout.session.completed', () => {
    it('uses customer_email when present without fetching customer', async () => {
      await seedUser('buyer@test.com');
      const stripeMock = installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_co_1',
            type: 'checkout.session.completed',
            data: { object: { customer: 'cus_1', customer_email: 'Buyer@Test.com', subscription: 'sub_1' } },
          })),
        },
        customers: { retrieve: spy() },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 1900000000, status: 'active' })) },
      });

      const res = await postWebhook();
      assert.equal(res.status, 200);
      assert.equal(stripeMock.customers.retrieve.calls.length, 0);
      const user = await db.findUser({ email: 'buyer@test.com' });
      assert.equal(user.subscription.stripeID, 'cus_1');
    });

    it('falls back to fetching customer when customer_email is missing', async () => {
      await seedUser('fetched@example.com');
      const stripeMock = installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_co_2',
            type: 'checkout.session.completed',
            data: { object: { customer: 'cus_2', subscription: 'sub_2' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'fetched@example.com' })) },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 1, status: 'active' })) },
      });

      await postWebhook();
      assert.equal(stripeMock.customers.retrieve.calls.length, 1);
      const user = await db.findUser({ email: 'fetched@example.com' });
      assert.equal(user.subscription.stripeID, 'cus_2');
    });
  });

  describe('invoice.paid', () => {
    it('updates subscription expiry and status', async () => {
      await seedUser('pay@example.com');
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_inv_1',
            type: 'invoice.paid',
            data: { object: { customer: 'cus_3', subscription: 'sub_3' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'pay@example.com' })) },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 2000000000, status: 'active' })) },
      });

      const res = await postWebhook();
      assert.equal(res.status, 200);
      const user = await db.findUser({ email: 'pay@example.com' });
      assert.deepEqual(user.subscription, {
        stripeID: 'cus_3',
        expires: 2000000000,
        status: 'active',
      });
    });
  });

  describe('invoice.payment_failed', () => {
    it('returns 200 for payment_failed events', async () => {
      await seedUser('fail@example.com');
      installStripeMock({
        webhooks: {
          constructEventAsync: spy(() => ({
            id: 'evt_fail_1',
            type: 'invoice.payment_failed',
            data: { object: { customer: 'cus_9' } },
          })),
        },
        customers: { retrieve: spy(() => ({ email: 'fail@example.com' })) },
      });

      const res = await postWebhook();
      assert.equal(res.status, 200);
    });
  });
});

// Sanity: confirm test DB path override loaded
describe('Test configuration', () => {
  it('uses TEST_DATABASE_PATH for sqlite connection', () => {
    assert.equal(config.database.connectionString, TEST_DB_PATH);
  });
});