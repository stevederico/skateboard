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
