/**
 * Authentication Flow Integration Tests
 *
 * Tests all auth endpoints: signup, signin, signout, CSRF, and JWT middleware.
 * Uses Node.js built-in test runner (node --test).
 *
 * Run with: node --test --experimental-sqlite server.test.js
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { DatabaseSync as Database } from 'node:sqlite';
import { mkdir, rm } from 'node:fs/promises';

// Test configuration
const TEST_DB_PATH = './databases/test.db';
const JWT_SECRET = 'test-secret-key-for-testing-only';
const TEST_USER = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'validpassword123'
};

// Minimal test server setup (mirrors production server structure)
let app;
let db;
let csrfTokenStore;

/**
 * Create test app with minimal auth routes
 */
function createTestApp() {
  app = new Hono();
  csrfTokenStore = new Map();

  // Initialize test database
  db = new Database(TEST_DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      _id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS Auths (
      email TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      userID TEXT NOT NULL
    )
  `);

  // Helper functions
  const generateCSRFToken = () => crypto.randomBytes(32).toString('hex');
  const generateUUID = () => crypto.randomUUID();
  const hashPassword = async (password) => await bcrypt.hash(password, 10);
  const verifyPassword = async (password, hash) => await bcrypt.compare(password, hash);
  const generateToken = (userID) => jwt.sign({ userID, exp: Math.floor(Date.now() / 1000) + 86400 }, JWT_SECRET);

  // Auth middleware
  const authMiddleware = async (c, next) => {
    const token = getCookie(c, 'token');
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      c.set('userID', String(payload.userID));
      await next();
    } catch (e) {
      if (e.name === 'TokenExpiredError') return c.json({ error: 'Token expired' }, 401);
      return c.json({ error: 'Invalid token' }, 401);
    }
  };

  // CSRF middleware
  const csrfProtection = async (c, next) => {
    if (c.req.method === 'GET') return next();
    const csrfToken = c.req.header('x-csrf-token');
    const userID = c.get('userID');
    if (!csrfToken || !userID) return c.json({ error: 'Invalid CSRF token' }, 403);
    const storedData = csrfTokenStore.get(userID);
    if (!storedData) return c.json({ error: 'Invalid CSRF token' }, 403);
    if (csrfToken !== storedData.token) return c.json({ error: 'Invalid CSRF token' }, 403);
    await next();
  };

  // Signup
  app.post('/api/signup', async (c) => {
    try {
      const body = await c.req.json();
      let { email, password, name } = body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return c.json({ error: 'Invalid email format or length' }, 400);
      }
      if (!password || password.length < 6 || password.length > 72) {
        return c.json({ error: 'Password must be 6-72 characters' }, 400);
      }
      if (!name || name.trim().length === 0) {
        return c.json({ error: 'Name required (max 100 characters)' }, 400);
      }

      email = email.toLowerCase().trim();
      const hash = await hashPassword(password);
      const insertID = generateUUID();

      try {
        db.prepare('INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)').run(insertID, email, name, Date.now());
        db.prepare('INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)').run(email, hash, insertID);
      } catch (e) {
        if (e.message?.includes('UNIQUE constraint failed')) {
          return c.json({ error: 'Unable to create account with provided credentials' }, 400);
        }
        throw e;
      }

      const token = generateToken(insertID);
      const csrfToken = generateCSRFToken();
      csrfTokenStore.set(insertID, { token: csrfToken, timestamp: Date.now() });

      setCookie(c, 'token', token, { httpOnly: true, path: '/' });
      setCookie(c, 'csrf_token', csrfToken, { httpOnly: false, path: '/' });

      return c.json({ id: insertID, email, name }, 201);
    } catch (e) {
      if (e instanceof SyntaxError) {
        return c.json({ error: 'Invalid request body' }, 400);
      }
      return c.json({ error: 'Server error' }, 500);
    }
  });

  // Signin
  app.post('/api/signin', async (c) => {
    try {
      const body = await c.req.json();
      let { email, password } = body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return c.json({ error: 'Invalid credentials' }, 400);
      }
      if (!password || typeof password !== 'string') {
        return c.json({ error: 'Invalid credentials' }, 400);
      }

      email = email.toLowerCase().trim();
      const auth = db.prepare('SELECT * FROM Auths WHERE email = ?').get(email);
      if (!auth) return c.json({ error: 'Invalid credentials' }, 401);
      if (!(await verifyPassword(password, auth.password))) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      const user = db.prepare('SELECT * FROM Users WHERE email = ?').get(email);
      if (!user) return c.json({ error: 'Invalid credentials' }, 401);

      const token = generateToken(user._id);
      const csrfToken = generateCSRFToken();
      csrfTokenStore.set(user._id, { token: csrfToken, timestamp: Date.now() });

      setCookie(c, 'token', token, { httpOnly: true, path: '/' });
      setCookie(c, 'csrf_token', csrfToken, { httpOnly: false, path: '/' });

      return c.json({ id: user._id, email: user.email, name: user.name });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return c.json({ error: 'Invalid request body' }, 400);
      }
      return c.json({ error: 'Server error' }, 500);
    }
  });

  // Signout
  app.post('/api/signout', authMiddleware, async (c) => {
    const userID = c.get('userID');
    csrfTokenStore.delete(userID);
    setCookie(c, 'token', '', { httpOnly: true, path: '/', maxAge: 0 });
    setCookie(c, 'csrf_token', '', { httpOnly: false, path: '/', maxAge: 0 });
    return c.json({ message: 'Signed out successfully' });
  });

  // Protected route for testing
  app.put('/api/me', authMiddleware, csrfProtection, async (c) => {
    return c.json({ success: true });
  });

  return app;
}

/**
 * Make test request to app
 */
async function request(method, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (options.cookies) {
    headers.set('Cookie', options.cookies);
  }

  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const res = await app.fetch(req);
  const json = await res.json().catch(() => null);

  return {
    status: res.status,
    json,
    headers: res.headers,
    cookies: res.headers.get('Set-Cookie')
  };
}

// ==== TESTS ====

describe('Authentication Flow', () => {
  before(async () => {
    await mkdir('./databases', { recursive: true });
  });

  beforeEach(() => {
    // Fresh app and database for each test
    if (db) {
      db.exec('DELETE FROM Auths');
      db.exec('DELETE FROM Users');
    }
    createTestApp();
  });

  after(async () => {
    if (db) db.close();
    await rm(TEST_DB_PATH, { force: true });
  });

  describe('POST /api/signup', () => {
    it('creates user with valid inputs', async () => {
      const res = await request('POST', '/api/signup', {
        body: TEST_USER
      });
      assert.equal(res.status, 201);
      assert.equal(res.json.email, TEST_USER.email);
      assert.equal(res.json.name, TEST_USER.name);
      assert.ok(res.json.id);
      assert.ok(res.cookies?.includes('token='));
      assert.ok(res.cookies?.includes('csrf_token='));
    });

    it('rejects invalid email format', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, email: 'not-an-email' }
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('email'));
    });

    it('rejects password too short', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, password: '12345' }
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Password'));
    });

    it('rejects password too long', async () => {
      const res = await request('POST', '/api/signup', {
        body: { ...TEST_USER, password: 'a'.repeat(73) }
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Password'));
    });

    it('rejects missing name', async () => {
      const res = await request('POST', '/api/signup', {
        body: { email: TEST_USER.email, password: TEST_USER.password }
      });
      assert.equal(res.status, 400);
      assert.ok(res.json.error.includes('Name'));
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
        body: 'not valid json'
      });
      const res = await app.fetch(req);
      assert.equal(res.status, 400);
    });
  });

  describe('POST /api/signin', () => {
    beforeEach(async () => {
      // Create test user
      await request('POST', '/api/signup', { body: TEST_USER });
    });

    it('signs in with correct credentials', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: TEST_USER.password }
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.email, TEST_USER.email);
      assert.ok(res.cookies?.includes('token='));
    });

    it('rejects non-existent email', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: 'nonexistent@example.com', password: 'password123' }
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid credentials');
    });

    it('rejects wrong password', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email, password: 'wrongpassword' }
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid credentials');
    });

    it('rejects invalid email format', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: 'not-an-email', password: 'password123' }
      });
      assert.equal(res.status, 400);
    });

    it('rejects missing password', async () => {
      const res = await request('POST', '/api/signin', {
        body: { email: TEST_USER.email }
      });
      assert.equal(res.status, 400);
    });

    it('rejects invalid JSON body', async () => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const req = new Request('http://localhost/api/signin', {
        method: 'POST',
        headers,
        body: 'not valid json'
      });
      const res = await app.fetch(req);
      assert.equal(res.status, 400);
    });
  });

  describe('POST /api/signout', () => {
    it('signs out authenticated user', async () => {
      // First sign up
      const signupRes = await request('POST', '/api/signup', { body: TEST_USER });
      const cookies = signupRes.cookies;

      // Parse token from cookies
      const tokenMatch = cookies?.match(/token=([^;]+)/);
      const token = tokenMatch?.[1];

      const res = await request('POST', '/api/signout', {
        cookies: `token=${token}`
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
    let userID;

    beforeEach(async () => {
      const res = await request('POST', '/api/signup', { body: TEST_USER });
      const tokenMatch = res.cookies?.match(/token=([^;]+)/);
      const csrfMatch = res.cookies?.match(/csrf_token=([^;]+)/);
      token = tokenMatch?.[1];
      csrfToken = csrfMatch?.[1];
      userID = res.json.id;
    });

    it('allows request with valid CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`,
        headers: { 'x-csrf-token': csrfToken }
      });
      assert.equal(res.status, 200);
    });

    it('rejects request with missing CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`
      });
      assert.equal(res.status, 403);
      assert.ok(res.json.error.includes('CSRF'));
    });

    it('rejects request with wrong CSRF token', async () => {
      const res = await request('PUT', '/api/me', {
        cookies: `token=${token}`,
        headers: { 'x-csrf-token': 'wrong-token' }
      });
      assert.equal(res.status, 403);
    });
  });

  describe('JWT Authentication', () => {
    it('allows request with valid token', async () => {
      const res = await request('POST', '/api/signup', { body: TEST_USER });
      const tokenMatch = res.cookies?.match(/token=([^;]+)/);
      const token = tokenMatch?.[1];

      const signoutRes = await request('POST', '/api/signout', {
        cookies: `token=${token}`
      });
      assert.equal(signoutRes.status, 200);
    });

    it('rejects request with missing token', async () => {
      const res = await request('POST', '/api/signout', {});
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Unauthorized');
    });

    it('rejects request with expired token', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        { userID: 'test-user', exp: Math.floor(Date.now() / 1000) - 3600 },
        JWT_SECRET
      );

      const res = await request('POST', '/api/signout', {
        cookies: `token=${expiredToken}`
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Token expired');
    });

    it('rejects request with invalid token', async () => {
      const res = await request('POST', '/api/signout', {
        cookies: 'token=invalid-token'
      });
      assert.equal(res.status, 401);
      assert.equal(res.json.error, 'Invalid token');
    });
  });
});

// ==== STRIPE WEBHOOK TESTS ====

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

/**
 * Build a Hono app with /api/payment wired to the given stripe and db mocks.
 * Mirrors the helper structure in server.js so refactors stay in lockstep.
 */
function createWebhookApp({ stripe, db, logger = noopLogger }) {
  const webhookApp = new Hono();

  async function resolveCustomerEmail(stripeID) {
    const customer = await stripe.customers.retrieve(stripeID);
    if (!customer?.email) {
      logger.warn('Webhook: Customer has no email', { stripeID });
      return null;
    }
    return customer.email.toLowerCase();
  }

  function buildSubscriptionPatch(stripeID, stripeSub) {
    return {
      stripeID,
      expires: stripeSub.current_period_end,
      status: stripeSub.status
    };
  }

  async function applyUserPatch(email, $set) {
    const user = await db.findUser({ email });
    if (!user) {
      logger.warn('Webhook: No user found for email', { email });
      return false;
    }
    await db.updateUser({ email }, { $set });
    return true;
  }

  webhookApp.post('/api/payment', async (c) => {
    const signature = c.req.header('stripe-signature');
    const rawBody = await c.req.arrayBuffer();
    const body = Buffer.from(rawBody);

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, 'test-secret');
    } catch (e) {
      return c.body(null, 400);
    }

    try {
      const existingEvent = await db.findWebhookEvent(event.id);
      if (existingEvent) return c.body(null, 200);
      await db.insertWebhookEvent(event.id, event.type, Date.now());

      const eventObject = event.data.object;

      if (['customer.subscription.deleted', 'customer.subscription.updated', 'customer.subscription.created'].includes(event.type)) {
        const { customer: stripeID, current_period_end, status } = eventObject;
        if (!stripeID) return c.body(null, 400);
        const email = await resolveCustomerEmail(stripeID);
        if (!email) return c.body(null, 400);
        await applyUserPatch(email, { subscription: { stripeID, expires: current_period_end, status } });
      }

      if (event.type === 'checkout.session.completed') {
        const { customer: stripeID, customer_email, subscription: subscriptionId } = eventObject;
        if (subscriptionId && stripeID) {
          const [subscription, email] = await Promise.all([
            stripe.subscriptions.retrieve(subscriptionId),
            customer_email ? Promise.resolve(customer_email.toLowerCase()) : resolveCustomerEmail(stripeID)
          ]);
          if (email) {
            await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          }
        }
      }

      if (event.type === 'invoice.paid') {
        const { customer: stripeID, subscription: subscriptionId } = eventObject;
        if (subscriptionId && stripeID) {
          const [subscription, email] = await Promise.all([
            stripe.subscriptions.retrieve(subscriptionId),
            resolveCustomerEmail(stripeID)
          ]);
          if (email) {
            await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          }
        }
      }

      if (event.type === 'invoice.payment_failed') {
        const { customer: stripeID } = eventObject;
        if (stripeID) {
          const email = await resolveCustomerEmail(stripeID);
          if (email) {
            await applyUserPatch(email, {
              'subscription.paymentFailed': true,
              'subscription.paymentFailedAt': Date.now()
            });
          }
        }
      }

      return c.body(null, 200);
    } catch (e) {
      return c.body(null, 500);
    }
  });

  return webhookApp;
}

/**
 * Stub builder that records every call so tests can assert on them.
 */
function spy(impl = () => {}) {
  const calls = [];
  const fn = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
  fn.calls = calls;
  return fn;
}

async function postWebhook(webhookApp, body = '{}', signature = 'test-sig') {
  const req = new Request('http://localhost/api/payment', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'Content-Type': 'application/json' },
    body
  });
  return webhookApp.fetch(req);
}

describe('Stripe Webhook', () => {
  it('returns 400 when signature verification fails', async () => {
    const stripe = {
      webhooks: { constructEventAsync: spy(() => { throw new Error('bad sig'); }) },
      customers: { retrieve: spy() },
      subscriptions: { retrieve: spy() }
    };
    const db = {
      findWebhookEvent: spy(),
      insertWebhookEvent: spy(),
      findUser: spy(),
      updateUser: spy()
    };
    const app = createWebhookApp({ stripe, db });
    const res = await postWebhook(app);
    assert.equal(res.status, 400);
    assert.equal(db.findWebhookEvent.calls.length, 0);
  });

  it('skips and returns 200 when event already processed (idempotency)', async () => {
    const stripe = {
      webhooks: { constructEventAsync: spy(() => ({ id: 'evt_123', type: 'invoice.paid', data: { object: {} } })) },
      customers: { retrieve: spy() },
      subscriptions: { retrieve: spy() }
    };
    const db = {
      findWebhookEvent: spy(() => ({ id: 'evt_123' })),
      insertWebhookEvent: spy(),
      findUser: spy(),
      updateUser: spy()
    };
    const app = createWebhookApp({ stripe, db });
    const res = await postWebhook(app);
    assert.equal(res.status, 200);
    assert.equal(db.insertWebhookEvent.calls.length, 0);
    assert.equal(db.updateUser.calls.length, 0);
  });

  it('records event before processing to prevent races', async () => {
    const order = [];
    const stripe = {
      webhooks: { constructEventAsync: spy(() => ({
        id: 'evt_1',
        type: 'customer.subscription.updated',
        data: { object: { customer: 'cus_1', current_period_end: 1700000000, status: 'active' } }
      })) },
      customers: { retrieve: async () => { order.push('customer.retrieve'); return { email: 'a@b.com' }; } },
      subscriptions: { retrieve: spy() }
    };
    const db = {
      findWebhookEvent: spy(),
      insertWebhookEvent: async (...a) => { order.push('insertWebhookEvent'); },
      findUser: async () => { order.push('findUser'); return { _id: 'u1' }; },
      updateUser: async () => { order.push('updateUser'); }
    };
    const app = createWebhookApp({ stripe, db });
    await postWebhook(app);
    assert.equal(order[0], 'insertWebhookEvent', 'event must be recorded before any user mutation');
  });

  describe('customer.subscription.* events', () => {
    function setup({ customerEmail = 'user@example.com', userExists = true } = {}) {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_sub_1',
          type: 'customer.subscription.updated',
          data: { object: { customer: 'cus_42', current_period_end: 1800000000, status: 'active' } }
        })) },
        customers: { retrieve: spy(() => customerEmail ? { email: customerEmail } : { email: null }) },
        subscriptions: { retrieve: spy() }
      };
      const db = {
        findWebhookEvent: spy(() => null),
        insertWebhookEvent: spy(),
        findUser: spy(() => userExists ? { _id: 'u1', email: customerEmail.toLowerCase() } : null),
        updateUser: spy()
      };
      return { stripe, db, app: createWebhookApp({ stripe, db }) };
    }

    it('updates user subscription on customer.subscription.updated', async () => {
      const { db, app } = setup();
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(db.updateUser.calls.length, 1);
      const [, patch] = db.updateUser.calls[0];
      assert.deepEqual(patch.$set.subscription, {
        stripeID: 'cus_42',
        expires: 1800000000,
        status: 'active'
      });
    });

    it('normalizes email to lowercase before lookup', async () => {
      const { db, app } = setup({ customerEmail: 'Mixed@Case.COM' });
      await postWebhook(app);
      assert.equal(db.findUser.calls[0][0].email, 'mixed@case.com');
    });

    it('returns 400 when customer ID is missing', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_x',
          type: 'customer.subscription.created',
          data: { object: { current_period_end: 1, status: 'active' } }
        })) },
        customers: { retrieve: spy() },
        subscriptions: { retrieve: spy() }
      };
      const db = { findWebhookEvent: spy(), insertWebhookEvent: spy(), findUser: spy(), updateUser: spy() };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 400);
      assert.equal(db.updateUser.calls.length, 0);
    });

    it('returns 400 when stripe customer has no email', async () => {
      const { db, app } = setup({ customerEmail: '' });
      const res = await postWebhook(app);
      assert.equal(res.status, 400);
      assert.equal(db.updateUser.calls.length, 0);
    });

    it('returns 200 and does not patch when user is unknown', async () => {
      const { db, app } = setup({ userExists: false });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(db.updateUser.calls.length, 0);
    });
  });

  describe('checkout.session.completed', () => {
    it('uses customer_email when present without fetching customer', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_co_1',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_1', customer_email: 'Buyer@Test.com', subscription: 'sub_1' } }
        })) },
        customers: { retrieve: spy() },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 1900000000, status: 'active' })) }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u1' })),
        updateUser: spy()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(stripe.customers.retrieve.calls.length, 0, 'should not fetch customer when email is on the event');
      assert.equal(db.findUser.calls[0][0].email, 'buyer@test.com');
      assert.equal(db.updateUser.calls[0][1].$set.subscription.stripeID, 'cus_1');
    });

    it('falls back to fetching customer when customer_email is missing', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_co_2',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_2', subscription: 'sub_2' } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'fetched@example.com' })) },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 1, status: 'active' })) }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u2' })),
        updateUser: spy()
      };
      const app = createWebhookApp({ stripe, db });
      await postWebhook(app);
      assert.equal(stripe.customers.retrieve.calls.length, 1);
      assert.equal(db.updateUser.calls[0][0].email, 'fetched@example.com');
    });
  });

  describe('invoice.paid', () => {
    it('updates subscription expiry and status', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_inv_1',
          type: 'invoice.paid',
          data: { object: { customer: 'cus_3', subscription: 'sub_3' } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'pay@example.com' })) },
        subscriptions: { retrieve: spy(() => ({ current_period_end: 2000000000, status: 'active' })) }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u3' })),
        updateUser: spy()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.deepEqual(db.updateUser.calls[0][1].$set.subscription, {
        stripeID: 'cus_3',
        expires: 2000000000,
        status: 'active'
      });
    });
  });

  describe('invoice.payment_failed', () => {
    it('marks the user as paymentFailed without changing subscription status', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_fail_1',
          type: 'invoice.payment_failed',
          data: { object: { customer: 'cus_9' } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'fail@example.com' })) },
        subscriptions: { retrieve: spy() }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u9' })),
        updateUser: spy()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      const [, patch] = db.updateUser.calls[0];
      assert.equal(patch.$set['subscription.paymentFailed'], true);
      assert.ok(typeof patch.$set['subscription.paymentFailedAt'] === 'number');
    });
  });
});
