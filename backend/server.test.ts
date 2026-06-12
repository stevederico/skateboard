/**
 * Authentication Flow Integration Tests
 *
 * Tests all auth endpoints: signup, signin, signout, CSRF, and JWT middleware.
 * Uses Node.js built-in test runner (node --test).
 *
 * Run with: node --test server.test.ts
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { compare as legacyBcryptCompare } from './vendor/legacy-bcrypt.js';
import crypto from 'crypto';
import { promisify } from 'node:util';
import type { AuthRecord, CsrfTokenEntry, JwtPayload, Logger, User, UserQuery } from './types.ts';

// crypto.scrypt's overloads defeat promisify's typings; assert the 3-arg promise form used here
const scryptAsync = promisify(crypto.scrypt) as (password: string | Buffer, salt: Buffer, keylen: number) => Promise<Buffer>;

// Local HS256 JWT helpers (mirror server.ts implementation)
function jwtSign(payload: JwtPayload, secret: string): string {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;
  return 'userID' in value && typeof value.userID === 'string'
    && 'exp' in value && typeof value.exp === 'number';
}
function jwtVerify(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const [head, body, sig] = parts;
  if (!head || !body || !sig) throw new Error('Invalid token');
  const expected = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid signature');
  }
  const decoded: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!isJwtPayload(decoded)) {
    throw new Error('Invalid token');
  }
  const payload = decoded;
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    const err = new Error('Token expired');
    err.name = 'TokenExpiredError';
    throw err;
  }
  return payload;
}
import { DatabaseSync as Database } from 'node:sqlite';
import { mkdir, rm } from 'node:fs/promises';
import { SQLiteProvider } from './adapters/sqlite.ts';

// Test configuration
const TEST_DB_PATH = './databases/test.db';
const JWT_SECRET = 'test-secret-key-for-testing-only';
const TEST_USER = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'validpassword123'
};

/** Hono environment for the test app: authMiddleware stores the JWT's userID. */
type TestEnv = { Variables: { userID: string } };

/** JSON body accepted by the signup/signin routes (fields validated at runtime). */
interface CredentialsBody {
  email?: string;
  password?: string;
  name?: string;
}

// Minimal test server setup (mirrors production server structure)
let app: Hono<TestEnv>;
let db: Database;
let csrfTokenStore: Map<string, CsrfTokenEntry>;

/**
 * Create test app with minimal auth routes
 */
function createTestApp(): Hono<TestEnv> {
  app = new Hono<TestEnv>();
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
  const hashPassword = async (password: string): Promise<string> => {
    const salt = crypto.randomBytes(16);
    const key = await scryptAsync(password, salt, 64);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  };
  const verifyPassword = async (password: string, stored: unknown): Promise<boolean> => {
    if (typeof stored !== 'string') return false;
    if (stored.startsWith('scrypt$')) {
      const [, saltB64, keyB64] = stored.split('$');
      const salt = Buffer.from(saltB64, 'base64url');
      const expected = Buffer.from(keyB64, 'base64url');
      const candidate = await scryptAsync(password, salt, 64);
      return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
    }
    if (stored.startsWith('$2')) return await legacyBcryptCompare(password, stored);
    return false;
  };
  const needsRehash = (stored: unknown): boolean => typeof stored === 'string' && !stored.startsWith('scrypt$');
  const generateToken = (userID: string): string => jwtSign({ userID, exp: Math.floor(Date.now() / 1000) + 86400 }, JWT_SECRET);

  // Auth middleware
  const authMiddleware: MiddlewareHandler<TestEnv> = async (c, next) => {
    const token = getCookie(c, 'token');
    if (!token) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const payload = jwtVerify(token, JWT_SECRET);
      c.set('userID', String(payload.userID));
      await next();
    } catch (e) {
      if ((e as Error).name === 'TokenExpiredError') return c.json({ error: 'Token expired' }, 401);
      return c.json({ error: 'Invalid token' }, 401);
    }
  };

  // CSRF middleware
  const csrfProtection: MiddlewareHandler<TestEnv> = async (c, next) => {
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
      const body = await c.req.json<CredentialsBody>();
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
        if ((e as Error).message?.includes('UNIQUE constraint failed')) {
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
      const body = await c.req.json<CredentialsBody>();
      let { email, password } = body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return c.json({ error: 'Invalid credentials' }, 400);
      }
      if (!password || typeof password !== 'string') {
        return c.json({ error: 'Invalid credentials' }, 400);
      }

      email = email.toLowerCase().trim();
      const auth = db.prepare('SELECT * FROM Auths WHERE email = ?').get(email) as AuthRecord | undefined;
      if (!auth) return c.json({ error: 'Invalid credentials' }, 401);
      if (!(await verifyPassword(password, auth.password))) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }

      // Lazy migrate legacy bcrypt hash to scrypt
      if (needsRehash(auth.password)) {
        try {
          const newHash = await hashPassword(password);
          db.prepare('UPDATE Auths SET password = ? WHERE email = ?').run(newHash, email);
        } catch (e) { /* best-effort */ }
      }

      const user = db.prepare('SELECT * FROM Users WHERE email = ?').get(email) as User | undefined;
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

/** Options accepted by the request() test helper. */
interface TestRequestOptions {
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Cookie header value sent with the request. */
  cookies?: string;
  /** JSON-serializable request body. */
  body?: unknown;
}

/** Union of every JSON body the auth routes under test return (success and error fields). */
interface AuthResponseBody {
  id: string;
  email: string;
  name: string;
  message: string;
  error: string;
}

/** Normalized response captured by the request() test helper. */
interface TestResponse {
  status: number;
  json: AuthResponseBody;
  headers: Headers;
  cookies: string | null;
}

/**
 * Make test request to app
 */
async function request(method: string, path: string, options: TestRequestOptions = {}): Promise<TestResponse> {
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
  const json = await res.json().catch(() => null) as AuthResponseBody;

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

  describe('Legacy bcrypt migration', () => {
    // Real bcrypt hash of 'validpassword123' at cost 10 — fixture for legacy verify path
    const LEGACY_BCRYPT_HASH = '$2b$10$gix5z78/st4CdQYVM8C4g.ygzzWZQ39pnLKhxVtMWK1HUeASfzIyG';
    const LEGACY_USER = {
      email: 'legacy@example.com',
      name: 'Legacy User',
      password: 'validpassword123'
    };

    function seedLegacyUser(): string {
      const userId = crypto.randomUUID();
      db.prepare('INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)')
        .run(userId, LEGACY_USER.email, LEGACY_USER.name, Date.now());
      db.prepare('INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)')
        .run(LEGACY_USER.email, LEGACY_BCRYPT_HASH, userId);
      return userId;
    }

    it('signs in user with stored bcrypt hash', async () => {
      seedLegacyUser();
      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: LEGACY_USER.password }
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.email, LEGACY_USER.email);
    });

    it('rejects wrong password against bcrypt hash', async () => {
      seedLegacyUser();
      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: 'wrongpassword' }
      });
      assert.equal(res.status, 401);
    });

    it('rehashes bcrypt hash to scrypt on successful login', async () => {
      seedLegacyUser();
      const before = db.prepare('SELECT password FROM Auths WHERE email = ?').get(LEGACY_USER.email) as { password: string };
      assert.ok(before.password.startsWith('$2'), 'fixture should be bcrypt');

      const res = await request('POST', '/api/signin', {
        body: { email: LEGACY_USER.email, password: LEGACY_USER.password }
      });
      assert.equal(res.status, 200);

      const after = db.prepare('SELECT password FROM Auths WHERE email = ?').get(LEGACY_USER.email) as { password: string };
      assert.ok(after.password.startsWith('scrypt$'), 'hash should be migrated to scrypt');

      // And the migrated hash itself verifies correctly
      const verifyOk = await (async () => {
        const [, s, k] = after.password.split('$');
        const salt = Buffer.from(s, 'base64url');
        const expected = Buffer.from(k, 'base64url');
        const candidate = await scryptAsync(LEGACY_USER.password, salt, 64);
        return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
      })();
      assert.ok(verifyOk, 'migrated scrypt hash must verify against original password');
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
    let token: string | undefined;
    let csrfToken: string | undefined;
    let userID: string;

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
        headers: { 'x-csrf-token': csrfToken! }
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
      const expiredToken = jwtSign(
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

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

/** Fields the webhook handler reads off a Stripe event's data.object. */
interface StripeEventObject {
  /** Stripe customer ID; absent on malformed events. */
  customer?: string;
  /** Unix timestamp (seconds) the current period ends (pre-basil top-level shape). */
  current_period_end?: number | null;
  /** Basil shape: period end lives on each subscription item. */
  items?: { data?: Array<{ current_period_end?: number | null }> };
  /** Stripe subscription status. */
  status?: string;
  /** Email captured on checkout sessions, when collected. */
  customer_email?: string;
  /** Subscription ID on checkout/invoice events (pre-basil top-level shape). */
  subscription?: string;
  /** Basil shape: invoice's subscription id lives under parent.subscription_details. */
  parent?: { subscription_details?: { subscription?: string } };
}

/** Minimal Stripe webhook event envelope. */
interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeEventObject };
}

/** Customer fields read off stripe.customers.retrieve results. */
interface StripeCustomer {
  email: string | null;
}

/** Subscription fields read off stripe.subscriptions.retrieve results (both API shapes). */
interface StripeSubscriptionInfo {
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> };
  status: string;
}

/** Subscription patch assembled from webhook event fields (absent on malformed events). */
interface SubscriptionPatch {
  stripeID: string;
  expires?: number | null;
  status?: string;
}

/** $set payloads the webhook handler writes via applyUserPatch. */
interface WebhookSetPayload {
  subscription?: SubscriptionPatch;
  'subscription.paymentFailed'?: boolean;
  'subscription.paymentFailedAt'?: number;
}

/** Update document the webhook handler passes to updateUser. */
interface WebhookUpdate {
  $set: WebhookSetPayload;
}

/** Stripe client surface the webhook handler touches. */
interface WebhookStripe {
  webhooks: { constructEventAsync(body: Buffer, signature: string | undefined, secret: string): Promise<StripeEvent> };
  customers: { retrieve(stripeID: string): Promise<StripeCustomer | null | undefined> };
  subscriptions: { retrieve(subscriptionId: string): Promise<StripeSubscriptionInfo> };
}

/** Database surface the webhook handler touches (loose returns fit the test doubles). */
interface WebhookDb {
  findWebhookEvent(eventId: string): Promise<unknown>;
  insertWebhookEvent(eventId: string, eventType: string, processedAt: number): Promise<unknown>;
  findUser(query: UserQuery): Promise<unknown>;
  updateUser(query: UserQuery, update: WebhookUpdate): Promise<unknown>;
}

/**
 * Build a Hono app with /api/payment wired to the given stripe and db mocks.
 * Mirrors the helper structure in server.ts so refactors stay in lockstep.
 */
function createWebhookApp({ stripe, db, logger = noopLogger }: { stripe: WebhookStripe; db: WebhookDb; logger?: Logger }): Hono {
  const webhookApp = new Hono();

  async function resolveCustomerEmail(stripeID: string): Promise<string | null> {
    const customer = await stripe.customers.retrieve(stripeID);
    if (!customer?.email) {
      logger.warn('Webhook: Customer has no email', { stripeID });
      return null;
    }
    return customer.email.toLowerCase();
  }

  function getSubscriptionPeriodEnd(sub: StripeSubscriptionInfo | StripeEventObject): number | null {
    return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  }

  function buildSubscriptionPatch(stripeID: string, stripeSub: StripeSubscriptionInfo): SubscriptionPatch {
    return {
      stripeID,
      expires: getSubscriptionPeriodEnd(stripeSub),
      status: stripeSub.status
    };
  }

  async function applyUserPatch(email: string, $set: WebhookSetPayload): Promise<boolean> {
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

    let event: StripeEvent;
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
        const { customer: stripeID, status } = eventObject;
        if (!stripeID) return c.body(null, 400);
        const email = await resolveCustomerEmail(stripeID);
        if (!email) return c.body(null, 400);
        await applyUserPatch(email, { subscription: { stripeID, expires: getSubscriptionPeriodEnd(eventObject), status } });
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
        const stripeID = eventObject.customer;
        const subscriptionId = eventObject.subscription ?? eventObject.parent?.subscription_details?.subscription;
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

/** Async stub produced by spy(): callable, plus a record of every call's arguments. */
interface Spy<TArgs extends unknown[] = unknown[], TResult = never> {
  (...args: TArgs): Promise<TResult>;
  /** Argument lists captured per invocation, in order. */
  calls: TArgs[];
}

/**
 * Stub builder that records every call so tests can assert on them.
 */
function spy<TArgs extends unknown[] = unknown[], TResult = never>(
  impl: (...args: TArgs) => TResult = (() => {}) as unknown as (...args: TArgs) => TResult
): Spy<TArgs, TResult> {
  const calls: TArgs[] = [];
  const fn = (async (...args: TArgs) => {
    calls.push(args);
    return impl(...args);
  }) as Spy<TArgs, TResult>;
  fn.calls = calls;
  return fn;
}

async function postWebhook(webhookApp: Hono, body = '{}', signature = 'test-sig'): Promise<Response> {
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
    const order: string[] = [];
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
      insertWebhookEvent: async (...a: unknown[]) => { order.push('insertWebhookEvent'); },
      findUser: async () => { order.push('findUser'); return { _id: 'u1' }; },
      updateUser: async () => { order.push('updateUser'); }
    };
    const app = createWebhookApp({ stripe, db });
    await postWebhook(app);
    assert.equal(order[0], 'insertWebhookEvent', 'event must be recorded before any user mutation');
  });

  describe('customer.subscription.* events', () => {
    function setup({ customerEmail = 'user@example.com', userExists = true }: { customerEmail?: string; userExists?: boolean } = {}) {
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
        findUser: spy<[UserQuery], { _id: string; email: string } | null>(() => userExists ? { _id: 'u1', email: customerEmail.toLowerCase() } : null),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
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

    it('reads item-level current_period_end on basil-shaped events', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_basil_1',
          type: 'customer.subscription.updated',
          data: { object: { customer: 'cus_42', status: 'active', items: { data: [{ current_period_end: 1850000000 }] } } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'basil@example.com' })) },
        subscriptions: { retrieve: spy() }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u1' })),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(db.updateUser.calls[0][1].$set.subscription!.expires, 1850000000);
    });

    it('stores expires null without throwing when no period end exists anywhere', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_basil_2',
          type: 'customer.subscription.updated',
          data: { object: { customer: 'cus_42', status: 'active' } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'basil@example.com' })) },
        subscriptions: { retrieve: spy() }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u1' })),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(db.updateUser.calls[0][1].$set.subscription!.expires, null);
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
        findUser: spy<[UserQuery], { _id: string }>(() => ({ _id: 'u1' })),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(stripe.customers.retrieve.calls.length, 0, 'should not fetch customer when email is on the event');
      assert.equal(db.findUser.calls[0][0].email, 'buyer@test.com');
      assert.equal(db.updateUser.calls[0][1].$set.subscription!.stripeID, 'cus_1');
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
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      await postWebhook(app);
      assert.equal(stripe.customers.retrieve.calls.length, 1);
      assert.equal(db.updateUser.calls[0][0].email, 'fetched@example.com');
    });

    it('reads item-level current_period_end from basil-shaped subscription retrievals', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_co_basil',
          type: 'checkout.session.completed',
          data: { object: { customer: 'cus_b', customer_email: 'basil@buy.com', subscription: 'sub_b' } }
        })) },
        customers: { retrieve: spy() },
        subscriptions: { retrieve: spy(() => ({ status: 'active', items: { data: [{ current_period_end: 1900000001 }] } })) }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'ub' })),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.deepEqual(db.updateUser.calls[0][1].$set.subscription, {
        stripeID: 'cus_b',
        expires: 1900000001,
        status: 'active'
      });
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
        updateUser: spy<[UserQuery, WebhookUpdate]>()
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

    it('resolves the subscription id from parent.subscription_details on basil-shaped invoices', async () => {
      const stripe = {
        webhooks: { constructEventAsync: spy(() => ({
          id: 'evt_inv_basil',
          type: 'invoice.paid',
          data: { object: { customer: 'cus_4', parent: { subscription_details: { subscription: 'sub_4' } } } }
        })) },
        customers: { retrieve: spy(() => ({ email: 'renew@example.com' })) },
        subscriptions: { retrieve: spy<[string], StripeSubscriptionInfo>(() => ({ current_period_end: 2100000000, status: 'active' })) }
      };
      const db = {
        findWebhookEvent: spy(),
        insertWebhookEvent: spy(),
        findUser: spy(() => ({ _id: 'u4' })),
        updateUser: spy<[UserQuery, WebhookUpdate]>()
      };
      const app = createWebhookApp({ stripe, db });
      const res = await postWebhook(app);
      assert.equal(res.status, 200);
      assert.equal(stripe.subscriptions.retrieve.calls[0][0], 'sub_4');
      assert.deepEqual(db.updateUser.calls[0][1].$set.subscription, {
        stripeID: 'cus_4',
        expires: 2100000000,
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
        updateUser: spy<[UserQuery, WebhookUpdate]>()
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

// ==== DATABASE ADAPTER TESTS ====

describe('database adapters', () => {
  const ADAPTER_DB_PATH = './databases/adapter-test.db';
  let provider: SQLiteProvider;
  let adapterDb: Database;

  before(async () => {
    provider = new SQLiteProvider();
    await provider.initialize();
    adapterDb = provider.getDatabase('AdapterTest', ADAPTER_DB_PATH);
  });

  beforeEach(() => {
    adapterDb.exec('DELETE FROM Auths');
    adapterDb.exec('DELETE FROM WebhookEvents');
    adapterDb.exec('DELETE FROM Users');
  });

  after(async () => {
    provider.closeAll();
    await rm(ADAPTER_DB_PATH, { force: true });
    await rm(`${ADAPTER_DB_PATH}-wal`, { force: true });
    await rm(`${ADAPTER_DB_PATH}-shm`, { force: true });
  });

  /** Insert a fresh user through the provider and return it. */
  async function seedUser(): Promise<User> {
    const user: User = {
      _id: crypto.randomUUID(),
      email: `adapter-${crypto.randomUUID()}@example.com`,
      name: 'Adapter User',
      created_at: Date.now()
    };
    await provider.insertUser(adapterDb, user);
    return user;
  }

  describe('SQLiteProvider null normalization', () => {
    it('findUser resolves exactly null for a missing id', async () => {
      const found = await provider.findUser(adapterDb, { _id: 'missing-user-id' });
      assert.equal(found, null);
    });

    it('findAuth resolves exactly null for a missing email', async () => {
      const found = await provider.findAuth(adapterDb, { email: 'missing@example.com' });
      assert.equal(found, null);
    });

    it('findWebhookEvent resolves exactly null for a missing event id', async () => {
      const found = await provider.findWebhookEvent(adapterDb, 'evt_missing');
      assert.equal(found, null);
    });
  });

  describe('SQLiteProvider deleteUser', () => {
    it('returns deletedCount 1 when deleting an existing user by _id', async () => {
      const user = await seedUser();
      const result = await provider.deleteUser(adapterDb, { _id: user._id });
      assert.equal(result.deletedCount, 1);
    });

    it('removes the user row', async () => {
      const user = await seedUser();
      await provider.deleteUser(adapterDb, { _id: user._id });
      assert.equal(await provider.findUser(adapterDb, { _id: user._id }), null);
    });

    it('returns deletedCount 0 for a missing id', async () => {
      const result = await provider.deleteUser(adapterDb, { _id: 'missing-user-id' });
      assert.equal(result.deletedCount, 0);
    });
  });
});
