// ==== IMPORTS ====
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import Stripe from "stripe";
import crypto from "crypto";

import { databaseManager } from "./adapters/manager.js";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs';
import { promisify } from 'node:util';

import {
  isProd,
  loadEnvFile,
  loadLocalENV,
  resolveEnvironmentVariables,
  validateEnvironmentVariables
} from './lib/env.js';
import { createLogger } from './lib/logger.js';
import { escapeHtml, validateEmail, validatePassword, validateName } from './lib/validation.js';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  jwtSign,
  jwtVerify,
  tokenExpireTimestamp,
  generateUUID,
  TOKEN_EXPIRATION_DAYS
} from './lib/auth.js';
import { evictOldestEntries } from './lib/store.js';

// ==== MODULE IDENTITY ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Determine if this module is being run directly (not imported)
 *
 * @param {string} moduleUrl - import.meta.url of the module
 * @returns {boolean} True when executed as the entry script
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(entry);
}

/**
 * Whether the HTTP server and process signal handlers should start.
 *
 * @param {string|undefined} [skipFlag=process.env.SKIP_SERVER_START] - Skip-server env value
 * @param {string} [moduleUrl=import.meta.url] - Module URL to compare with argv entry
 * @returns {boolean} True when this process should bind a port
 */
export function __testShouldStartServer(skipFlag = process.env.SKIP_SERVER_START, moduleUrl = import.meta.url) {
  return skipFlag !== '1' && isMainModule(moduleUrl);
}

const shouldStartServer = __testShouldStartServer();

// ==== SERVER CONFIG ====
/**
 * Resolve HTTP listen port from environment.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment variables
 * @returns {number} Parsed port number
 */
export function __testResolvePort(env = process.env) {
  return parseInt(env.PORT || '8000');
}

const port = __testResolvePort();

// ==== STRUCTURED LOGGING ====
const logger = createLogger(isProd);

// ==== CSRF PROTECTION ====
const csrfTokenStore = new Map(); // userID -> { token, timestamp }
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const CSRF_MAX_ENTRIES = 50000; // LRU eviction threshold

/**
 * Generate cryptographically secure CSRF token
 *
 * Uses crypto.randomBytes to generate 64-character hex token.
 *
 * @returns {string} Hex-encoded CSRF token
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF protection middleware using timing-safe comparison
 *
 * Validates CSRF token from x-csrf-token header against stored token for userID.
 * Skips validation for GET requests and signup/signin routes. Uses timing-safe
 * comparison to prevent timing attacks. Enforces 24-hour token expiry.
 * Auto-regenerates token if missing (e.g., server restart) for authenticated users.
 *
 * @async
 * @param {Context} c - Hono context
 * @param {Function} next - Next middleware function
 * @returns {Promise<Response|void>} 403 error or continues to next middleware
 */
async function csrfProtection(c, next) {
  if (c.req.method === 'GET' || c.req.path === '/api/signup' || c.req.path === '/api/signin') {
    return next();
  }

  const csrfToken = c.req.header('x-csrf-token');
  const userID = c.get('userID'); // Set by authMiddleware

  if (!csrfToken || !userID) {
    logger.info('CSRF validation failed - missing token or userID', {
      hasToken: !!csrfToken,
      hasUserID: !!userID,
      path: c.req.path
    });
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  let storedData = csrfTokenStore.get(userID);
  if (!storedData) {
    // Auto-regenerate token for authenticated users (e.g., after server restart)
    // Security: This block only runs if authMiddleware passed (JWT valid)
    const newToken = generateCSRFToken();
    storedData = { token: newToken, timestamp: Date.now() };
    csrfTokenStore.set(userID, storedData);

    setCookie(c, 'csrf_token', newToken, {
      httpOnly: false,
      secure: isProd(),
      sameSite: 'Lax',
      path: '/',
      maxAge: CSRF_TOKEN_EXPIRY / 1000
    });

    logger.info('CSRF token auto-regenerated after store miss', { userID });
    await next();
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(csrfToken);
  const storedBuffer = Buffer.from(storedData.token);
  if (tokenBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, storedBuffer)) {
    logger.info('CSRF validation failed - token mismatch', {
      userID,
      path: c.req.path
    });
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  // Check if token is expired
  if (Date.now() - storedData.timestamp > CSRF_TOKEN_EXPIRY) {
    csrfTokenStore.delete(userID);
    logger.info('CSRF validation failed - token expired', {
      userID,
      age: Math.floor((Date.now() - storedData.timestamp) / 1000) + 's'
    });
    return c.json({ error: 'CSRF token expired' }, 403);
  }

  logger.debug('CSRF validation passed', { userID });
  await next();
}

/**
 * Remove expired CSRF tokens and evict oldest entries when over limit
 *
 * @returns {void}
 */
export function __testRunCsrfCleanup() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userID, data] of csrfTokenStore.entries()) {
    if (now - data.timestamp > CSRF_TOKEN_EXPIRY) {
      csrfTokenStore.delete(userID);
      cleaned++;
    }
  }

  evictOldestEntries(csrfTokenStore, CSRF_MAX_ENTRIES, (data) => data.timestamp);

  if (cleaned > 0) {
    logger.debug('CSRF cleanup completed', { removedTokens: cleaned });
  }
}

/**
 * Register hourly CSRF cleanup interval
 *
 * @returns {void}
 */
export function __testRegisterCsrfInterval() {
  setInterval(__testRunCsrfCleanup, 60 * 60 * 1000);
}

/**
 * Register CSRF cleanup interval when server startup is enabled
 *
 * @param {boolean} [shouldStart=shouldStartServer] - Whether startup hooks are active
 * @returns {void}
 */
export function __testRegisterCsrfIntervalIfStarted(shouldStart = shouldStartServer) {
  if (shouldStart) {
    __testRegisterCsrfInterval();
  }
}

// Cleanup expired CSRF tokens every hour to prevent memory leak
__testRegisterCsrfIntervalIfStarted();

// ==== ACCOUNT LOCKOUT ====
const loginAttemptStore = new Map(); // email -> { attempts, lockedUntil }
const LOCKOUT_THRESHOLD = 5; // Lock after 5 failed attempts
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MAX_ENTRIES = 50000; // LRU eviction threshold

/**
 * Check if account is locked due to failed login attempts
 *
 * @param {string} email - Email address to check
 * @returns {{locked: boolean, remainingTime: number}} Lock status and remaining time in seconds
 */
function isAccountLocked(email) {
  const record = loginAttemptStore.get(email);
  if (!record) return { locked: false, remainingTime: 0 };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      locked: true,
      remainingTime: Math.ceil((record.lockedUntil - now) / 1000)
    };
  }

  // Lock expired, clear record
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttemptStore.delete(email);
  }

  return { locked: false, remainingTime: 0 };
}

/**
 * Record a failed login attempt for an email
 *
 * Increments attempt counter. Locks account after LOCKOUT_THRESHOLD failures.
 *
 * @param {string} email - Email address that failed login
 * @returns {void}
 */
function recordFailedLogin(email) {
  const now = Date.now();
  let record = loginAttemptStore.get(email);

  if (!record) {
    record = { attempts: 0, lockedUntil: null };
    loginAttemptStore.set(email, record);
  }

  record.attempts++;

  if (record.attempts >= LOCKOUT_THRESHOLD) {
    record.lockedUntil = now + LOCKOUT_DURATION;
    logger.info('Account locked due to failed attempts', { email: email.substring(0, 3) + '***' });
  }
}

/**
 * Clear failed login attempts on successful login
 *
 * @param {string} email - Email address to clear
 * @returns {void}
 */
function clearFailedLogins(email) {
  loginAttemptStore.delete(email);
}

/**
 * Remove expired lockout entries and evict oldest when over limit
 *
 * @returns {void}
 */
export function __testRunLockoutCleanup() {
  const now = Date.now();
  let cleaned = 0;

  for (const [email, record] of loginAttemptStore.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      loginAttemptStore.delete(email);
      cleaned++;
    }
  }

  evictOldestEntries(loginAttemptStore, LOCKOUT_MAX_ENTRIES, (data) => data.lockedUntil || 0);

  if (cleaned > 0) {
    logger.debug('Lockout cleanup completed', { removedEntries: cleaned });
  }
}

/**
 * Register lockout cleanup interval
 *
 * @returns {void}
 */
export function __testRegisterLockoutInterval() {
  setInterval(__testRunLockoutCleanup, 15 * 60 * 1000);
}

/**
 * Register lockout cleanup interval when server startup is enabled
 *
 * @param {boolean} [shouldStart=shouldStartServer] - Whether startup hooks are active
 * @returns {void}
 */
export function __testRegisterLockoutIntervalIfStarted(shouldStart = shouldStartServer) {
  if (shouldStart) {
    __testRegisterLockoutInterval();
  }
}

// Cleanup expired lockout entries every 15 minutes
__testRegisterLockoutIntervalIfStarted();

/**
 * Register production hourly maintenance interval when running in production
 *
 * @param {boolean} [prod=isProd()] - Production mode flag
 * @param {boolean} [shouldStart=shouldStartServer] - Whether server startup hooks are enabled
 * @returns {void}
 */
export function __testMaybeRegisterProdHourlyInterval(prod = isProd(), shouldStart = shouldStartServer) {
  if (prod && shouldStart) {
    __testRegisterProdHourlyInterval();
  }
}

/**
 * Register production hourly maintenance interval
 *
 * @returns {void}
 */
export function __testRegisterProdHourlyInterval() {
  setInterval(__testRunProdHourlyTask, 60 * 60 * 1000);
}

// ==== CONFIG & ENV ====
// Environment setup - MUST happen before config loading
if (!isProd()) {
  loadLocalENV({ baseDir: __dirname, logger });
}
__testMaybeRegisterProdHourlyInterval();

/**
 * Production-only hourly maintenance task
 *
 * @returns {void}
 */
export function __testRunProdHourlyTask() {
  logger.debug('Hourly task completed');
}

/**
 * Load application config from config.json with fallback defaults
 *
 * @async
 * @returns {Promise<Object>} Resolved application config
 */
export async function __testLoadApplicationConfig() {
  try {
    const configPath = resolve(__dirname, './config.json');
    const configData = await promisify(readFile)(configPath);
    const rawConfig = JSON.parse(configData.toString());

    const resolvedConnectionString = process.env.TEST_DATABASE_PATH
      ?? resolveEnvironmentVariables(rawConfig.database.connectionString, logger);
    return {
      staticDir: rawConfig.staticDir || '../dist',
      database: {
        ...rawConfig.database,
        connectionString: resolvedConnectionString
      }
    };
  } catch (err) {
    logger.error('Failed to load config, using defaults', { error: err.message });
    return {
      staticDir: '../dist',
      database: {
        db: "MyApp",
        dbType: "sqlite",
        connectionString: process.env.TEST_DATABASE_PATH ?? "./databases/MyApp.db"
      }
    };
  }
}

// Load and process configuration
let config = await __testLoadApplicationConfig();

const STRIPE_KEY = process.env.STRIPE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const envValidationPassed = validateEnvironmentVariables({
  config,
  stripeKey: STRIPE_KEY,
  stripeEndpointSecret: process.env.STRIPE_ENDPOINT_SECRET,
  jwtSecret: JWT_SECRET,
  logger
});

if (envValidationPassed) {
  logger.info('Environment variables validated successfully');
}

logger.info('Single-client backend initialized');

// ==== DATABASE CONFIG ====
// Single database configuration - no origin-based routing needed
const dbConfig = config.database;

// ==== SERVICES SETUP ====
/**
 * Log warning when Stripe is disabled due to missing API key
 *
 * @returns {void}
 */
export function __testWarnStripeDisabled() {
  logger.warn('STRIPE_KEY not set - Stripe functionality disabled');
}

/**
 * Initialize Stripe client or disable when API key is missing
 *
 * @param {string|undefined} stripeKey - Stripe secret key
 * @returns {import('stripe').default|null}
 */
export function __testInitializeStripe(stripeKey) {
  if (stripeKey) {
    return new Stripe(stripeKey);
  }
  __testWarnStripeDisabled();
  return null;
}

// Stripe setup (only if key is available)
let stripe = __testInitializeStripe(STRIPE_KEY);

// Single database config - always use the same one
const currentDbConfig = dbConfig;

/**
 * Database helper with pre-bound configuration
 *
 * Provides shorthand methods for database operations without repeating
 * dbType, db, connectionString on every call.
 *
 * @type {Object}
 * @example
 * // Instead of:
 * await db.findUser( { email });
 * // Use:
 * await db.findUser({ email });
 */
const db = {
  findUser: (query, projection) => databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, projection),
  insertUser: (userData) => databaseManager.insertUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, userData),
  updateUser: (query, update) => databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, update),
  findAuth: (query) => databaseManager.findAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query),
  insertAuth: (authData) => databaseManager.insertAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, authData),
  updateAuth: (query, update) => databaseManager.updateAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, update),
  findWebhookEvent: (eventId) => databaseManager.findWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId),
  insertWebhookEvent: (eventId, eventType, processedAt) => databaseManager.insertWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId, eventType, processedAt),
  executeQuery: (queryObject) => databaseManager.executeQuery(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, queryObject)
};

// ==== HONO SETUP ====
const app = new Hono();

/**
 * Resolve allowed CORS origins from environment or development defaults
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] - Environment variables
 * @returns {string[]} Allowed CORS origins
 */
export function __testResolveCorsOrigins(env = process.env) {
  return env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:8000'];
}

// CORS middleware (needed for development when frontend is on different port)
const corsOrigins = __testResolveCorsOrigins();

app.use('*', cors({
  origin: corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  credentials: true
}));

/**
 * Apache Common Log Format request logger middleware.
 *
 * @async
 * @param {import('hono').Context} c - Hono context
 * @param {Function} next - Next middleware
 * @returns {Promise<void>}
 */
export async function __testApacheLogMiddleware(c, next) {
  const start = Date.now();
  await next();
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  const method = c.req.method;
  const url = c.req.path;
  const status = c.res.status;
  const duration = Date.now() - start;

  console.log(`[${timestamp}] "${method} ${url}" ${status} (${duration}ms)`);
}

// Apache Common Log Format middleware
app.use('*', __testApacheLogMiddleware);

/**
 * Build secure-headers middleware options for the current environment.
 *
 * @param {boolean} [prod=isProd()] - Production mode flag
 * @returns {import('hono/secure-headers').SecureHeadersOptions} Secure headers config
 */
export function __testBuildSecureHeadersOptions(prod = isProd()) {
  return {
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    },
    strictTransportSecurity: !prod ? false : 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: []
    }
  };
}

// Security headers middleware
app.use('*', secureHeaders(__testBuildSecureHeadersOptions()));

/**
 * Development-only request logging middleware.
 *
 * @async
 * @param {import('hono').Context} c - Hono context
 * @param {Function} next - Next middleware
 * @param {boolean} [prod=isProd()] - Production mode flag
 * @returns {Promise<void>}
 */
export async function __testDevRequestLogMiddleware(c, next, prod = isProd()) {
  if (!prod) {
    const requestId = Math.random().toString(36).substr(2, 9);
    logger.debug('Request received', { method: c.req.method, path: c.req.path, requestId });
  }
  await next();
}

// Request logging middleware (dev only)
app.use('*', __testDevRequestLogMiddleware);

/**
 * Generate JWT token for user authentication
 *
 * Creates HS256-signed JWT with 30-day expiration. Requires JWT_SECRET
 * environment variable.
 *
 * @async
 * @param {string} userID - User ID to encode in token
 * @returns {Promise<string>} Signed JWT token
 * @throws {Error} If JWT_SECRET not configured or signing fails
 */
async function generateToken(userID) {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not configured - authentication disabled");
    }

    const exp = tokenExpireTimestamp();
    const payload = { userID, exp };

    return jwtSign(payload, process.env.JWT_SECRET);
  } catch (error) {
    logger.error('Token generation error', { error: error.message });
    throw error;
  }
}

/**
 * Authentication middleware using JWT from HttpOnly cookie
 *
 * Verifies JWT token from 'token' cookie. Sets userID in context on success,
 * normalized to string for consistent Map key usage across middleware (CSRF, sessions).
 * Returns 401 for missing, expired, or invalid tokens. Returns 503 if
 * JWT_SECRET not configured.
 *
 * @async
 * @param {Context} c - Hono context
 * @param {Function} next - Next middleware function
 * @returns {Promise<Response|void>} 401/503 error or continues to next middleware
 */
async function authMiddleware(c, next) {
  if (!process.env.JWT_SECRET) {
    return c.json({ error: "Authentication service unavailable" }, 503);
  }

  // Read token from HttpOnly cookie
  const token = getCookie(c, 'token');
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = jwtVerify(token, process.env.JWT_SECRET);
    // Normalize userID to string for consistent Map key usage (CSRF, sessions)
    const normalizedUserID = String(payload.userID);
    c.set('userID', normalizedUserID);
    await next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.debug('Token expired');
      return c.json({ error: "Token expired" }, 401);
    }
    logger.error('Token verification error', { error: error.message });
    return c.json({ error: "Invalid token" }, 401);
  }
}

/**
 * Set authentication cookies and generate CSRF token for user session
 *
 * Creates CSRF token, stores it in memory, and sets both JWT (HttpOnly) and
 * CSRF (readable) cookies. Consolidates duplicate cookie logic from signup/signin.
 *
 * @async
 * @param {Context} c - Hono context
 * @param {string} userID - User ID to associate with session
 * @param {string} jwtToken - Pre-generated JWT token
 * @returns {string} Generated CSRF token
 */
function setAuthCookies(c, userID, jwtToken) {
  const csrfToken = generateCSRFToken();
  csrfTokenStore.set(userID.toString(), { token: csrfToken, timestamp: Date.now() });

  // Set HttpOnly JWT cookie
  setCookie(c, 'token', jwtToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'Strict',
    path: '/',
    maxAge: TOKEN_EXPIRATION_DAYS * 24 * 60 * 60
  });

  // Set CSRF token cookie (readable by frontend)
  setCookie(c, 'csrf_token', csrfToken, {
    httpOnly: false,
    secure: isProd(),
    sameSite: 'Lax',
    path: '/',
    maxAge: CSRF_TOKEN_EXPIRY / 1000
  });

  return csrfToken;
}

// ==== STRIPE WEBHOOK (raw body needed) ====

/**
 * Resolve a Stripe customer ID to a normalized lowercase email.
 *
 * @param {string} stripeID - Stripe customer ID
 * @returns {Promise<string|null>} Normalized email, or null if missing
 */
async function resolveCustomerEmail(stripeID) {
  const customer = await stripe.customers.retrieve(stripeID);
  if (!customer?.email) {
    logger.warn('Webhook: Customer has no email', { stripeID });
    return null;
  }
  return customer.email.toLowerCase();
}

/**
 * Build the canonical user.subscription patch from a Stripe customer ID
 * and a Stripe subscription object.
 *
 * @param {string} stripeID - Stripe customer ID
 * @param {object} stripeSub - Stripe subscription object
 * @returns {{stripeID: string, expires: number, status: string}}
 */
function buildSubscriptionPatch(stripeID, stripeSub) {
  return {
    stripeID,
    expires: stripeSub.current_period_end,
    status: stripeSub.status
  };
}

/**
 * Apply a $set patch to the user identified by email. Returns false if no
 * matching user is found (silent no-op so Stripe will not retry).
 *
 * @param {string} email - Normalized email
 * @param {object} $set - MongoDB-style $set fields
 * @returns {Promise<boolean>} True if a user was patched
 */
async function applyUserPatch(email, $set) {
  const user = await db.findUser({ email });
  if (!user) {
    logger.warn('Webhook: No user found for email', { email });
    return false;
  }
  await db.updateUser({ _id: user._id }, { $set });
  return true;
}

app.post("/api/payment", async (c) => {
  logger.info('Payment webhook received');

  const signature = c.req.header("stripe-signature");
  const rawBody = await c.req.arrayBuffer();
  const body = Buffer.from(rawBody);

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, process.env.STRIPE_ENDPOINT_SECRET);
    logger.debug('Webhook event received', { type: event.type });
  } catch (e) {
    logger.error('Webhook signature verification failed', { error: e.message });
    return c.body(null, 400);
  }

  try {
    // Idempotency check - skip if already processed
    const existingEvent = await db.findWebhookEvent(event.id);
    if (existingEvent) {
      logger.info('Webhook event already processed, skipping', { eventId: event.id });
      return c.body(null, 200);
    }

    // Record event BEFORE processing to prevent race conditions
    await db.insertWebhookEvent(event.id, event.type, Date.now());

    const eventObject = event.data.object;

    if (["customer.subscription.deleted", "customer.subscription.updated", "customer.subscription.created"].includes(event.type)) {
      const { customer: stripeID, current_period_end, status } = eventObject;
      if (!stripeID) {
        logger.error('Webhook missing customer ID', { type: event.type });
        return c.body(null, 400);
      }
      const email = await resolveCustomerEmail(stripeID);
      if (!email) return c.body(null, 400);
      const ok = await applyUserPatch(email, { subscription: { stripeID, expires: current_period_end, status } });
      if (ok) logger.info('Subscription updated', { type: event.type, email, status });
    }

    if (event.type === "checkout.session.completed") {
      const { customer: stripeID, customer_email, subscription: subscriptionId } = eventObject;
      if (subscriptionId && stripeID) {
        const [subscription, email] = await Promise.all([
          stripe.subscriptions.retrieve(subscriptionId),
          customer_email ? Promise.resolve(customer_email.toLowerCase()) : resolveCustomerEmail(stripeID)
        ]);
        if (email) {
          const ok = await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          if (ok) logger.info('Checkout completed', { email, status: subscription.status });
        }
      }
    }

    if (event.type === "invoice.paid") {
      const { customer: stripeID, subscription: subscriptionId } = eventObject;
      if (subscriptionId && stripeID) {
        const [subscription, email] = await Promise.all([
          stripe.subscriptions.retrieve(subscriptionId),
          resolveCustomerEmail(stripeID)
        ]);
        if (email) {
          const ok = await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          if (ok) logger.info('Invoice paid', { email });
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const { customer: stripeID } = eventObject;
      if (stripeID) {
        const email = await resolveCustomerEmail(stripeID);
        if (email) {
          const ok = await applyUserPatch(email, {
            'subscription.paymentFailed': true,
            'subscription.paymentFailedAt': Date.now()
          });
          if (ok) logger.warn('Invoice payment failed', { email });
        }
      }
    }

    return c.body(null, 200);
  } catch (e) {
    logger.error('Webhook processing error', { error: e.message });
    return c.body(null, 500);
  }
});

// ==== STATIC ROUTES ====
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

/**
 * Integration test route handler that throws intentionally (test env only).
 *
 * @returns {never}
 */
function __testIntegrationErrorHandler() {
  throw new Error('Intentional integration test error');
}

// Integration test hook — route registered at module load (before matcher is built)
if (process.env.NODE_ENV === 'test') {
  app.get('/api/__integration_error_test__', __testIntegrationErrorHandler);
}

/**
 * Parse JSON request body with proper error handling
 *
 * Returns parsed JSON or null if parsing fails. Sets 400 response on failure.
 * Handles SyntaxError from malformed JSON.
 *
 * @async
 * @param {Context} c - Hono context
 * @returns {Promise<Object|null>} Parsed body or null on error
 */
/**
 * Sanitize a user-update field value for persistence
 *
 * @param {*} value - Raw request value
 * @returns {*} Escaped string or original non-string value
 */
export function __testSanitizeUserUpdateValue(value) {
  return typeof value === 'string' ? escapeHtml(value.trim()) : value;
}

/**
 * Resolve usage object from a user record with defaults.
 *
 * @param {Object} user - User record from database
 * @returns {{count: number, reset_at: number|null}} Usage snapshot
 */
export function __testResolveUsage(user) {
  return user.usage || { count: 0, reset_at: null };
}

/**
 * Resolve post-increment usage count from an updated user record.
 *
 * @param {Object|null|undefined} updatedUser - User record after increment
 * @returns {number} Usage count, defaulting to 1 when missing
 */
export function __testResolveActualCount(updatedUser) {
  return updatedUser?.usage?.count || 1;
}

async function parseJsonBody(c) {
  try {
    return await c.req.json();
  } catch (e) {
    if (e instanceof SyntaxError) {
      return null;
    }
    throw e;
  }
}

// ==== AUTH ROUTES ====
app.post("/api/signup", async (c) => {
  try {
    const body = await parseJsonBody(c);
    if (!body) {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    let { email, password, name } = body;

    // Validation
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid email format or length' }, 400);
    }
    if (!validatePassword(password)) {
      return c.json({ error: 'Password must be 6-72 characters' }, 400);
    }
    if (!validateName(name)) {
      return c.json({ error: 'Name required (max 100 characters)' }, 400);
    }

    email = email.toLowerCase().trim();
    name = escapeHtml(name.trim());

    const hash = await hashPassword(password);
    let insertID = generateUUID()

    try {
      // Insert user first
      await db.insertUser({
        _id: insertID,
        email: email,
        name: name,
        created_at: Date.now()
      });

      // Insert auth record (compensating delete on failure)
      try {
        await db.insertAuth({ email: email, password: hash, userID: insertID });
      } catch (authError) {
        // Rollback: delete the user we just created
        logger.error('Auth insert failed, rolling back user creation', { error: authError.message });
        try {
          await db.executeQuery({ query: 'DELETE FROM Users WHERE _id = ?', params: [insertID] });
        } catch (rollbackError) {
          logger.error('Rollback failed - orphaned user record', { userID: insertID, error: rollbackError.message });
        }
        throw authError;
      }

      const token = await generateToken(insertID);
      setAuthCookies(c, insertID, token);
      logger.info('Signup success');

      return c.json({
        id: insertID.toString(),
        email: email,
        name: name.trim(),
        tokenExpires: tokenExpireTimestamp()
      }, 201);
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('duplicate key') || e.code === 11000) {
        logger.warn('Signup failed - duplicate account');
        return c.json({ error: "Unable to create account with provided credentials" }, 400);
      }
      throw e;
    }
  } catch (e) {
    logger.error('Signup error', { error: e.message });
    return c.json({ error: "Server error" }, 500);
  }
});

app.post("/api/signin", async (c) => {
  try {
    const body = await parseJsonBody(c);
    if (!body) {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    let { email, password } = body;

    // Validation
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid credentials' }, 400);
    }
    if (!password || typeof password !== 'string') {
      return c.json({ error: 'Invalid credentials' }, 400);
    }

    email = email.toLowerCase().trim();
    logger.debug('Attempting signin');

    // Check account lockout
    const lockStatus = isAccountLocked(email);
    if (lockStatus.locked) {
      c.header('Retry-After', String(lockStatus.remainingTime));
      return c.json({
        error: 'Account temporarily locked. Try again later.',
        retryAfter: lockStatus.remainingTime
      }, 429);
    }

    // Check if auth exists
    const auth = await db.findAuth( { email: email });
    if (!auth) {
      logger.debug('Auth record not found');
      recordFailedLogin(email);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Verify password
    if (!(await verifyPassword(password, auth.password))) {
      logger.debug('Password verification failed');
      recordFailedLogin(email);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Lazy migrate legacy bcrypt hash to scrypt (best-effort, never blocks login)
    if (needsRehash(auth.password)) {
      try {
        const newHash = await hashPassword(password);
        await db.updateAuth({ email }, { password: newHash });
        logger.debug('Password hash migrated to scrypt');
      } catch (e) {
        logger.warn('Password rehash failed', { error: e.message });
      }
    }

    // Get user
    const user = await db.findUser( { email: email });
    if (!user) {
      logger.error('User not found for auth record');
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Clear failed attempts on successful login
    clearFailedLogins(email);

    // Generate token
    const token = await generateToken(user._id.toString());
    setAuthCookies(c, user._id, token);
    logger.info('Signin success');

    return c.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      ...(user.subscription && {
        subscription: {
          stripeID: user.subscription.stripeID,
          expires: user.subscription.expires,
          status: user.subscription.status,
        },
      }),
      tokenExpires: tokenExpireTimestamp()
    });
  } catch (e) {
    logger.error('Signin error', { error: e.message });
    return c.json({ error: "Server error" }, 500);
  }
});

app.post("/api/signout", authMiddleware, async (c) => {
  try {
    const userID = c.get('userID');

    // Clear CSRF token from store
    csrfTokenStore.delete(userID);

    // Clear the HttpOnly cookie
    deleteCookie(c, 'token', {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'Strict',
      path: '/'
    });

    // Clear the CSRF token cookie
    deleteCookie(c, 'csrf_token', {
      httpOnly: false,
      secure: isProd(),
      sameSite: 'Lax',
      path: '/'
    });

    logger.info('Signout success');
    return c.json({ message: "Signed out successfully" });
  } catch (e) {
    logger.error('Signout error', { error: e.message });
    return c.json({ error: "Server error" }, 500);
  }
});

// ==== USER DATA ROUTES ====
app.get("/api/me", authMiddleware, async (c) => {
  const userID = c.get('userID');
  const user = await db.findUser( { _id: userID });
  logger.debug('/me checking for user');
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

app.put("/api/me", authMiddleware, csrfProtection, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { name } = body;

    // Validation
    if (name !== undefined && !validateName(name)) {
      return c.json({ error: 'Name must be 1-100 characters' }, 400);
    }

    // Whitelist of fields users are allowed to update
    const UPDATEABLE_USER_FIELDS = ['name'];

    // Find user first to verify existence
    const user = await db.findUser( { _id: userID });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Whitelist approach - only allow specific fields
    const update = {};
    for (const [key, value] of Object.entries(body)) {
      if (UPDATEABLE_USER_FIELDS.includes(key)) {
        update[key] = __testSanitizeUserUpdateValue(value);
      }
    }

    if (Object.keys(update).length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    // Update user document
    const result = await db.updateUser( { _id: userID }, { $set: update });

    if (result.modifiedCount === 0) {
      return c.json({ error: "No changes made" }, 400);
    }

    // Return updated user
    const updatedUser = await db.findUser( { _id: userID });
    return c.json(updatedUser);
  } catch (err) {
    logger.error('Update user error', { error: err.message });
    return c.json({ error: "Failed to update user" }, 500);
  }
});

// ==== USAGE TRACKING ====
app.post("/api/usage", authMiddleware, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { operation } = body; // "check" or "track"

    if (!operation || !['check', 'track'].includes(operation)) {
      return c.json({ error: "Invalid operation. Must be 'check' or 'track'" }, 400);
    }

    // Get user
    const user = await db.findUser( { _id: userID });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Check if user is a subscriber - subscribers get unlimited
    const isSubscriber = user.subscription?.status === 'active' &&
      (!user.subscription?.expires || user.subscription.expires > Math.floor(Date.now() / 1000));

    if (isSubscriber) {
      return c.json({
        remaining: -1,
        total: -1,
        isSubscriber: true,
        subscription: {
          status: user.subscription.status,
          expiresAt: user.subscription.expires ? new Date(user.subscription.expires * 1000).toISOString() : null
        }
      });
    }

    // Get usage limit from environment
    const limit = parseInt(process.env.FREE_USAGE_LIMIT || '20');
    const now = Math.floor(Date.now() / 1000);

    // Initialize usage if not set
    let usage = __testResolveUsage(user);

    // Check if we need to reset (30 days = 2592000 seconds)
    if (!usage.reset_at || now > usage.reset_at) {
      const newResetAt = now + (30 * 24 * 60 * 60); // 30 days from now
      // Reset usage - atomic set operation
      await db.updateUser(
        { _id: userID },
        { $set: { usage: { count: 0, reset_at: newResetAt } } }
      );
      usage = { count: 0, reset_at: newResetAt };
    }

    if (operation === 'track') {
      // Atomic increment first to prevent race conditions
      // Then verify we haven't exceeded the limit
      await db.updateUser(
        { _id: userID },
        { $inc: { 'usage.count': 1 } }
      );

      // Re-read user to get actual count after atomic increment
      const updatedUser = await db.findUser( { _id: userID });
      const actualCount = __testResolveActualCount(updatedUser);

      // If we exceeded the limit, rollback the increment and return 429
      if (actualCount > limit) {
        await db.updateUser(
          { _id: userID },
          { $inc: { 'usage.count': -1 } }
        );
        return c.json({
          error: "Usage limit reached",
          remaining: 0,
          total: limit,
          isSubscriber: false
        }, 429);
      }

      usage.count = actualCount;
    }

    // Return usage info (with subscription details for free users too)
    return c.json({
      remaining: Math.max(0, limit - usage.count),
      total: limit,
      isSubscriber: false,
      used: usage.count,
      subscription: user.subscription ? {
        status: user.subscription.status,
        expiresAt: user.subscription.expires ? new Date(user.subscription.expires * 1000).toISOString() : null
      } : null
    });

  } catch (error) {
    logger.error('Usage tracking error', { error: error.message });
    return c.json({ error: "Server error" }, 500);
  }
});

// ==== PAYMENT ROUTES ====
app.post("/api/checkout", authMiddleware, csrfProtection, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { email, lookup_key } = body;

    if (!email || !lookup_key) return c.json({ error: "Missing email or lookup_key" }, 400);

    // Verify the email matches the authenticated user
    const user = await db.findUser( { _id: userID });
    if (!user || user.email !== email) return c.json({ error: "Email mismatch" }, 403);

    const prices = await stripe.prices.list({ lookup_keys: [lookup_key], expand: ["data.product"] });

    if (!prices.data || prices.data.length === 0) {
      return c.json({ error: `No price found for lookup_key: ${lookup_key}` }, 400);
    }

    // Use FRONTEND_URL env var or origin header, fallback to localhost for dev
    const origin = process.env.FRONTEND_URL || c.req.header('origin') || `http://localhost:${port}`;

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      billing_address_collection: "auto",
      success_url: `${origin}/app/payment?success=true`,
      cancel_url: `${origin}/app/payment?canceled=true`,
      subscription_data: { metadata: { email } },
    });
    return c.json({ url: session.url, id: session.id, customerID: session.customer });
  } catch (e) {
    logger.error('Checkout session error', { error: e.message });
    return c.json({ error: "Stripe session failed" }, 500);
  }
});

app.post("/api/portal", authMiddleware, csrfProtection, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { customerID } = body;

    if (!customerID) return c.json({ error: "Missing customerID" }, 400);

    // Verify the customerID matches the authenticated user's subscription
    const user = await db.findUser( { _id: userID });
    if (!user || (user.subscription?.stripeID && user.subscription.stripeID !== customerID)) {
      return c.json({ error: "Unauthorized customerID" }, 403);
    }

    // Use FRONTEND_URL env var or origin header, fallback to localhost for dev
    const origin = process.env.FRONTEND_URL || c.req.header('origin') || `http://localhost:${port}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerID,
      return_url: `${origin}/app/payment?portal=return`,
    });
    return c.json({ url: portalSession.url, id: portalSession.id });
  } catch (e) {
    logger.error('Portal session error', { error: e.message });
    return c.json({ error: "Stripe portal failed" }, 500);
  }
});

// ==== STATIC FILE SERVING (Production) ====
const staticDir = resolve(__dirname, config.staticDir);

// Serve static files
app.use('/*', serveStatic({ root: staticDir }));

// SPA fallback — only for non-asset routes
app.get('*', async (c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.match(/\.\w+$/)) {
    return c.notFound();
  }
  try {
    const indexPath = resolve(staticDir, 'index.html');
    const file = await promisify(readFile)(indexPath);
    return c.html(new TextDecoder().decode(file));
  } catch {
    return c.text("Welcome to Skateboard API", 200);
  }
});

// ==== ERROR HANDLER ====
app.onError((err, c) => {
  const requestId = Math.random().toString(36).substr(2, 9);

  logger.error('Unhandled error occurred', {
    message: err.message,
    stack: !isProd() ? err.stack : undefined,
    path: c.req.path,
    method: c.req.method,
    requestId
  });

  return c.json({
    error: !isProd() ? err.message : 'Internal server error',
    ...(!isProd() && { stack: err.stack })
  }, 500);
});

// ==== SERVER STARTUP ====
let server;

/**
 * Log successful server startup
 *
 * @param {{ port: number }} info - Server listen info from @hono/node-server
 * @returns {void}
 */
export function __testOnServerStarted(info) {
  logger.info('Server started successfully', {
    port: info.port,
    environment: !isProd() ? 'development' : 'production'
  });
}

/**
 * Gracefully shut down HTTP server and database connections
 *
 * @param {import('@hono/node-server').Server} httpServer - HTTP server instance
 * @param {string} signal - Signal name (SIGTERM, SIGINT)
 * @param {Object} [options] - Shutdown options
 * @param {Function} [options.exit] - Process exit function (for tests)
 * @param {Function} [options.setForceExitTimeout] - Schedule forced exit (for tests)
 * @returns {Promise<void>}
 */
export function __testGracefulShutdown(httpServer, signal, options = {}) {
  const exit = options.exit ?? process.exit.bind(process);
  const setForceExitTimeout = options.setForceExitTimeout ?? ((fn, ms) => setTimeout(fn, ms));

  console.log(`${signal} received. Shutting down gracefully...`);

  httpServer.close(async () => {
    console.log('Server closed');

    try {
      await databaseManager.closeAll();
      console.log('Database connections closed');
    } catch (err) {
      console.error('Error closing database connections:', err);
    }

    exit(0);
  });

  setForceExitTimeout(() => {
    console.error('Forced shutdown after timeout');
    exit(1);
  }, 10000);
}

/**
 * Register SIGTERM/SIGINT handlers for graceful shutdown
 *
 * @param {import('@hono/node-server').Server} httpServer - HTTP server instance
 * @returns {void}
 */
export function __testRegisterGracefulShutdown(httpServer) {
  if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => __testGracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => __testGracefulShutdown(httpServer, 'SIGINT'));
  }
}

/** @type {typeof serve} */
let __testServeFactory = serve;

/**
 * Replace the HTTP server factory used by default startup (tests only).
 *
 * @param {typeof serve} factory - Injectable serve implementation
 * @returns {void}
 */
export function __testSetServeFactory(factory) {
  __testServeFactory = factory;
}

/**
 * Start HTTP server and register graceful shutdown handlers
 *
 * @param {Function} [serveFn] - Server factory (defaults to injectable serve factory)
 * @returns {import('@hono/node-server').Server}
 */
export function __testStartHttpServer(serveFn = __testServeFactory) {
  const httpServer = serveFn({
    fetch: app.fetch,
    port,
    hostname: '::'
  }, __testOnServerStarted);

  __testRegisterGracefulShutdown(httpServer);
  return httpServer;
}

/**
 * Start HTTP server when startup is enabled
 *
 * @param {boolean} [shouldStart=shouldStartServer] - Whether startup hooks are active
 * @param {Function} [serveFn=__testServeFactory] - Server factory
 * @returns {import('@hono/node-server').Server|null}
 */
export function __testStartHttpServerIfNeeded(shouldStart = shouldStartServer, serveFn = __testServeFactory) {
  if (!shouldStart) return null;
  return __testStartHttpServer(serveFn);
}

server = __testStartHttpServerIfNeeded();

/**
 * Replace the module-level Stripe client (for integration tests only).
 *
 * @param {import('stripe').default|null} stripeClient - Mock or real Stripe instance
 * @returns {void}
 */
function setStripeForTests(stripeClient) {
  stripe = stripeClient;
}

// ==== TEST EXPORTS ====
export {
  app,
  db,
  config,
  stripe,
  setStripeForTests,
  csrfTokenStore,
  loginAttemptStore,
  logger,
  isProd,
  loadEnvFile,
  loadLocalENV,
  resolveEnvironmentVariables,
  validateEnvironmentVariables,
  escapeHtml,
  validateEmail,
  validatePassword,
  validateName,
  hashPassword,
  verifyPassword,
  needsRehash,
  jwtSign,
  jwtVerify,
  tokenExpireTimestamp,
  generateUUID,
  evictOldestEntries,
  generateCSRFToken,
  csrfProtection,
  isAccountLocked,
  recordFailedLogin,
  clearFailedLogins,
  buildSubscriptionPatch,
  resolveCustomerEmail,
  applyUserPatch,
  parseJsonBody,
  generateToken,
  authMiddleware,
  setAuthCookies,
  shouldStartServer
};
