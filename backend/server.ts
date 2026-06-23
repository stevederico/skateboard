// ==== IMPORTS ====
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import Stripe from "stripe";
import crypto from "crypto";

import { databaseManager } from "./adapters/manager.ts";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, stat } from 'node:fs';
import { promisify } from 'node:util';
import type { BackendConfig, BoundDatabase, CsrfTokenEntry, DatabaseConfig, JwtPayload, Logger, Subscription, UserSetFields } from './types.ts';
import { createLogger } from './lib/logger.ts';
import { isProd, loadEnvFile, loadLocalENV, resolveEnvironmentVariables, validateEnvironmentVariables } from './lib/env.ts';
import { escapeHtml, validateEmail, validatePassword, validateName } from './lib/validation.ts';
import { evictOldestEntries } from './lib/store.ts';
import {
  TOKEN_EXPIRATION_DAYS,
  hashPassword,
  verifyPassword,
  needsRehash,
  tokenExpireTimestamp,
  jwtSign,
  jwtVerify,
  generateUUID,
} from './lib/auth.ts';

/** Hono context environment: authMiddleware sets userID for downstream middleware/handlers. */
type AppEnv = { Variables: { userID: string } };

/**
 * Determine if this module is being run directly (not imported).
 *
 * @param moduleUrl - import.meta.url of the module
 * @returns True when executed as the entry script
 */
export function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(fileURLToPath(moduleUrl)) === resolve(entry);
}

/**
 * Whether the HTTP server and process signal handlers should start.
 *
 * @param skipFlag - Skip-server env value
 * @param moduleUrl - Module URL to compare with argv entry
 * @returns True when this process should bind a port
 */
export function __testShouldStartServer(
  skipFlag: string | undefined = process.env.SKIP_SERVER_START,
  moduleUrl: string = import.meta.url
): boolean {
  return skipFlag !== '1' && isMainModule(moduleUrl);
}

const shouldStartServer = __testShouldStartServer();

/**
 * Resolve HTTP listen port from environment.
 *
 * @param env - Environment variables
 * @returns Parsed port number
 */
export function __testResolvePort(env: NodeJS.ProcessEnv = process.env): number {
  return parseInt(env.PORT || '8000');
}

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Narrows to Error to read `.message`; falls back to String() for non-Error
 * throwables. Used in catch blocks instead of casting the caught value.
 *
 * @param e - Unknown caught value
 * @returns Error message string
 */
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Unreference a timer so it doesn't keep the process event loop alive.
 *
 * Lets background cleanup intervals run unconditionally (independent of
 * whether this module is the entry script) without blocking process/test
 * exit. Guards the call so test doubles that return a non-timer (e.g. a
 * number) from setInterval are tolerated.
 *
 * @param timer - Return value of setInterval
 * @returns void
 */
function unrefTimer(timer: unknown): void {
  if (timer && typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
    timer.unref();
  }
}

// ==== SERVER CONFIG ====
const port = __testResolvePort();

// ==== STRUCTURED LOGGING ====
// Defined early so all code can use it (no external dependencies)
const logger: Logger = createLogger(isProd);

// ==== CSRF PROTECTION ====
const csrfTokenStore = new Map<string, CsrfTokenEntry>(); // userID -> { token, timestamp }
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const CSRF_MAX_ENTRIES = 50000; // LRU eviction threshold

/**
 * Generate cryptographically secure CSRF token
 *
 * Uses crypto.randomBytes to generate 64-character hex token.
 *
 * @returns Hex-encoded CSRF token
 */
function generateCSRFToken(): string {
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
 * @param c - Hono context
 * @param next - Next middleware function
 * @returns 403 error or continues to next middleware
 */
async function csrfProtection(c: Context<AppEnv>, next: Next) {
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
 * Remove expired CSRF tokens and evict oldest entries when over limit.
 *
 * @returns void
 */
export function __testRunCsrfCleanup(): void {
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
 * Register hourly CSRF cleanup interval.
 *
 * @returns void
 */
export function __testRegisterCsrfInterval(): void {
  unrefTimer(setInterval(__testRunCsrfCleanup, 60 * 60 * 1000));
}

/**
 * Register CSRF cleanup interval when server startup is enabled.
 *
 * @param shouldStart - Whether startup hooks are active
 * @returns void
 */
export function __testRegisterCsrfIntervalIfStarted(shouldStart: boolean = shouldStartServer): void {
  if (shouldStart) {
    __testRegisterCsrfInterval();
  }
}

// Register unconditionally (not gated on shouldStartServer): csrfTokenStore
// capacity/expiry cleanup must run whenever this module is loaded — including
// when imported by a wrapper/bootstrap rather than run as the entry script —
// or the store would grow without bound. The timer is unref'd so it never
// blocks process/test exit.
__testRegisterCsrfInterval();

// ==== ACCOUNT LOCKOUT ====
const loginAttemptStore = new Map<string, { attempts: number; lockedUntil: number | null }>(); // email -> { attempts, lockedUntil }
const LOCKOUT_THRESHOLD = 5; // Lock after 5 failed attempts
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MAX_ENTRIES = 50000; // LRU eviction threshold

/**
 * Check if account is locked due to failed login attempts
 *
 * @param email - Email address to check
 * @returns Lock status and remaining time in seconds
 */
function isAccountLocked(email: string): { locked: boolean; remainingTime: number } {
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
 * @param email - Email address that failed login
 */
function recordFailedLogin(email: string): void {
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
 * @param email - Email address to clear
 */
function clearFailedLogins(email: string): void {
  loginAttemptStore.delete(email);
}

/**
 * Remove expired lockout entries and evict oldest when over limit.
 *
 * @returns void
 */
export function __testRunLockoutCleanup(): void {
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
 * Register lockout cleanup interval.
 *
 * @returns void
 */
export function __testRegisterLockoutInterval(): void {
  unrefTimer(setInterval(__testRunLockoutCleanup, 15 * 60 * 1000));
}

/**
 * Register lockout cleanup interval when server startup is enabled.
 *
 * @param shouldStart - Whether startup hooks are active
 * @returns void
 */
export function __testRegisterLockoutIntervalIfStarted(shouldStart: boolean = shouldStartServer): void {
  if (shouldStart) {
    __testRegisterLockoutInterval();
  }
}

// Register unconditionally (see CSRF interval note): loginAttemptStore
// capacity/expiry cleanup must run on every module load, unref'd so it never
// blocks process/test exit.
__testRegisterLockoutInterval();

/**
 * Register production hourly maintenance interval when running in production.
 *
 * @param prod - Production mode flag
 * @param shouldStart - Whether server startup hooks are enabled
 * @returns void
 */
export function __testMaybeRegisterProdHourlyInterval(
  prod: boolean = isProd(),
  shouldStart: boolean = shouldStartServer
): void {
  if (prod && shouldStart) {
    __testRegisterProdHourlyInterval();
  }
}

/**
 * Register production hourly maintenance interval.
 *
 * @returns void
 */
export function __testRegisterProdHourlyInterval(): void {
  unrefTimer(setInterval(__testRunProdHourlyTask, 60 * 60 * 1000));
}

/**
 * Production-only hourly maintenance task.
 *
 * @returns void
 */
export function __testRunProdHourlyTask(): void {
  logger.debug('Hourly task completed');
}

// ==== CONFIG & ENV ====
// Environment setup - MUST happen before config loading
if (!isProd()) {
  loadLocalENV({ logger });
}
__testMaybeRegisterProdHourlyInterval();

/**
 * Validate the parsed config.json shape: a `database` object carrying string
 * `db`, `dbType`, and `connectionString`. Narrows unknown JSON before use.
 *
 * @param value - Parsed JSON value
 * @returns True if the value matches the expected config shape
 */
function isRawConfig(value: unknown): value is { staticDir?: string; database: DatabaseConfig } {
  if (typeof value !== 'object' || value === null || !('database' in value)) return false;
  const { database } = value;
  if (typeof database !== 'object' || database === null) return false;
  return 'db' in database && typeof database.db === 'string'
    && 'dbType' in database && typeof database.dbType === 'string'
    && 'connectionString' in database && typeof database.connectionString === 'string';
}

/**
 * Load application config from config.json with fallback defaults.
 *
 * @returns Resolved application config
 */
export async function __testLoadApplicationConfig(): Promise<BackendConfig> {
  try {
    const configFilename = fileURLToPath(import.meta.url);
    const configDirname = dirname(configFilename);
    const configPath = resolve(configDirname, './config.json');
    const configData = await promisify(readFile)(configPath);
    const parsedConfig: unknown = JSON.parse(configData.toString());
    if (!isRawConfig(parsedConfig)) {
      throw new Error('Invalid config.json shape');
    }
    const rawConfig = parsedConfig;

    return {
      staticDir: rawConfig.staticDir || '../dist',
      database: {
        ...rawConfig.database,
        connectionString: resolveEnvironmentVariables(rawConfig.database.connectionString, logger)
      }
    };
  } catch (err) {
    logger.error('Failed to load config, using defaults', { error: errorMessage(err) });
    return {
      staticDir: '../dist',
      database: {
        db: "MyApp",
        dbType: "sqlite",
        connectionString: process.env.TEST_DATABASE_PATH || "./databases/MyApp.db"
      }
    };
  }
}

let config: BackendConfig = await __testLoadApplicationConfig();

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
 * Log warning when Stripe is disabled due to missing API key.
 *
 * @returns void
 */
export function __testWarnStripeDisabled(): void {
  logger.warn('STRIPE_KEY not set - Stripe functionality disabled');
}

/**
 * Initialize Stripe client or disable when API key is missing.
 *
 * @param stripeKey - Stripe secret key
 * @returns Stripe client or null
 */
export function __testInitializeStripe(stripeKey: string | undefined): Stripe | null {
  if (stripeKey) {
    return new Stripe(stripeKey);
  }
  __testWarnStripeDisabled();
  return null;
}

let stripe: Stripe | null = __testInitializeStripe(STRIPE_KEY);

// Single database config - always use the same one
const currentDbConfig = dbConfig;

/**
 * Database helper with pre-bound configuration
 *
 * Provides shorthand methods for database operations without repeating
 * dbType, db, connectionString on every call.
 *
 * @example
 * // Instead of:
 * await db.findUser( { email });
 * // Use:
 * await db.findUser({ email });
 */
const db: BoundDatabase = {
  findUser: (query, projection) => databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, projection),
  insertUser: (userData) => databaseManager.insertUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, userData),
  updateUser: (query, update) => databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, update),
  deleteUser: (query) => databaseManager.deleteUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query),
  findAuth: (query) => databaseManager.findAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query),
  insertAuth: (authData) => databaseManager.insertAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, authData),
  updateAuth: (query, update) => databaseManager.updateAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, query, update),
  findWebhookEvent: (eventId) => databaseManager.findWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId),
  insertWebhookEvent: (eventId, eventType, processedAt) => databaseManager.insertWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId, eventType, processedAt),
  executeQuery: (queryObject) => databaseManager.executeQuery(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, queryObject)
};

// ==== HONO SETUP ====
const app = new Hono<AppEnv>();

// Get __dirname for static file serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve allowed CORS origins from environment or development defaults.
 *
 * @param env - Environment variables
 * @returns Allowed CORS origins
 */
export function __testResolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:8000'];
}

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
 * @param c - Hono context
 * @param next - Next middleware
 * @returns void
 */
export async function __testApacheLogMiddleware(c: Context<AppEnv>, next: Next): Promise<void> {
  const start = Date.now();
  await next();
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  const method = c.req.method;
  const url = c.req.path;
  const status = c.res.status;
  const duration = Date.now() - start;

  console.log(`[${timestamp}] "${method} ${url}" ${status} (${duration}ms)`);
}

app.use('*', __testApacheLogMiddleware);

/**
 * Build secure-headers middleware options for the current environment.
 *
 * @param prod - Production mode flag
 * @returns Secure headers config
 */
export function __testBuildSecureHeadersOptions(prod: boolean = isProd()) {
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
    strictTransportSecurity: !prod ? false as const : 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions: 'DENY' as const,
    xContentTypeOptions: 'nosniff' as const,
    referrerPolicy: 'strict-origin-when-cross-origin' as const,
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: []
    }
  };
}

app.use('*', secureHeaders(__testBuildSecureHeadersOptions()));

/**
 * Development-only request logging middleware.
 *
 * @param c - Hono context
 * @param next - Next middleware
 * @param prod - Production mode flag
 * @returns void
 */
export async function __testDevRequestLogMiddleware(
  c: Context<AppEnv>,
  next: Next,
  prod: boolean = isProd()
): Promise<void> {
  if (!prod) {
    const requestId = Math.random().toString(36).substr(2, 9);
    logger.debug('Request received', { method: c.req.method, path: c.req.path, requestId });
  }
  await next();
}

app.use('*', __testDevRequestLogMiddleware);

/**
 * Generate JWT token for user authentication
 *
 * Creates HS256-signed JWT with 30-day expiration. Requires JWT_SECRET
 * environment variable.
 *
 * @async
 * @param userID - User ID to encode in token
 * @returns Signed JWT token
 * @throws If JWT_SECRET not configured or signing fails
 */
async function generateToken(userID: string): Promise<string> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET not configured - authentication disabled");
    }

    const exp = tokenExpireTimestamp();
    const payload = { userID, exp };

    return jwtSign(payload, jwtSecret);
  } catch (error) {
    logger.error('Token generation error', { error: errorMessage(error) });
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
 * @param c - Hono context
 * @param next - Next middleware function
 * @returns 401/503 error or continues to next middleware
 */
async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json({ error: "Authentication service unavailable" }, 503);
  }

  // Read token from HttpOnly cookie
  const token = getCookie(c, 'token');
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = jwtVerify(token, jwtSecret);
    // Normalize userID to string for consistent Map key usage (CSRF, sessions)
    const normalizedUserID = String(payload.userID);
    c.set('userID', normalizedUserID);
    await next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      logger.debug('Token expired');
      return c.json({ error: "Token expired" }, 401);
    }
    logger.error('Token verification error', { error: errorMessage(error) });
    return c.json({ error: "Invalid token" }, 401);
  }
}

/**
 * Set authentication cookies and generate CSRF token for user session
 *
 * Creates CSRF token, stores it in memory, and sets both JWT (HttpOnly) and
 * CSRF (readable) cookies. Consolidates duplicate cookie logic from signup/signin.
 *
 * @param c - Hono context
 * @param userID - User ID to associate with session
 * @param jwtToken - Pre-generated JWT token
 * @returns Generated CSRF token
 */
function setAuthCookies(c: Context<AppEnv>, userID: string, jwtToken: string): string {
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
 * Subscription fields this server reads from Stripe webhook payloads and
 * subscription retrievals. Pre-basil Stripe API versions expose
 * current_period_end at the top level; basil (2025-03-31+) moved it onto each
 * subscription item.
 */
type StripeSubscriptionLike = {
  current_period_end?: number | null;
  status: string;
  items?: { data?: Array<{ current_period_end?: number | null }> };
};

/**
 * Resolve a subscription's period end across Stripe API versions: top-level
 * (pre-basil) first, then the first subscription item (basil). Returns null
 * when absent so callers store a NULL expires instead of binding undefined
 * (node:sqlite throws on undefined parameters).
 */
function getSubscriptionPeriodEnd(sub: StripeSubscriptionLike): number | null {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

/**
 * Narrow an unknown Stripe payload to the subscription fields this server
 * reads. Validates `status` is a string; the optional period-end fields are
 * read defensively by getSubscriptionPeriodEnd, so their presence is not
 * required here.
 *
 * @param value - Unknown Stripe subscription-shaped object
 * @returns True if the value carries a string `status`
 */
function isStripeSubscriptionLike(value: unknown): value is StripeSubscriptionLike {
  return typeof value === 'object' && value !== null
    && 'status' in value && typeof value.status === 'string';
}

/**
 * Read the customer ID and subscription fields off a webhook event object.
 *
 * Replaces an `as unknown as` cast on `event.data.object`: pulls `customer`
 * (when a string) and the StripeSubscriptionLike fields (status, period-end,
 * items) directly from the validated object, defaulting `status` to '' when
 * absent — matching the prior cast's blind-trust behavior without asserting.
 *
 * @param value - The webhook `event.data.object`
 * @returns Customer ID (optional) plus subscription fields
 */
function toSubscriptionEvent(value: unknown): { customer?: string } & StripeSubscriptionLike {
  if (typeof value !== 'object' || value === null) {
    return { status: '' };
  }
  const customer = 'customer' in value && typeof value.customer === 'string' ? value.customer : undefined;
  const status = 'status' in value && typeof value.status === 'string' ? value.status : '';
  const current_period_end = 'current_period_end' in value && typeof value.current_period_end === 'number'
    ? value.current_period_end
    : undefined;
  const items = 'items' in value && isStripeSubscriptionItems(value.items) ? value.items : undefined;
  return { customer, status, current_period_end, items };
}

/**
 * Validate the `items` shape read by getSubscriptionPeriodEnd: an object whose
 * optional `data` is an array of objects with an optional numeric
 * `current_period_end` (basil API location for the period end).
 *
 * @param value - Candidate `items` value
 * @returns True if the value matches StripeSubscriptionLike['items']
 */
function isStripeSubscriptionItems(value: unknown): value is StripeSubscriptionLike['items'] {
  if (typeof value !== 'object' || value === null) return false;
  if (!('data' in value)) return true;
  const { data } = value;
  if (data === undefined) return true;
  return Array.isArray(data)
    && data.every((item) => typeof item === 'object' && item !== null);
}

/**
 * Resolve a Stripe customer ID to a normalized lowercase email.
 *
 * @param stripeID - Stripe customer ID
 * @returns Normalized email, or null if missing
 */
async function resolveCustomerEmail(stripeID: string): Promise<string | null> {
  const s = stripe;
  if (!s) {
    logger.warn('Webhook: Stripe not configured', { stripeID });
    return null;
  }
  const customer = await s.customers.retrieve(stripeID) as Stripe.Customer;
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
 * @param stripeID - Stripe customer ID
 * @param stripeSub - Stripe subscription object
 */
function buildSubscriptionPatch(stripeID: string, stripeSub: Stripe.Subscription): Subscription {
  const expires = isStripeSubscriptionLike(stripeSub) ? getSubscriptionPeriodEnd(stripeSub) : null;
  if (expires === null) {
    logger.error('Webhook: subscription has no current_period_end at top level or item level', { stripeID });
  }
  return {
    stripeID,
    expires,
    status: stripeSub.status
  };
}

/**
 * Apply a $set patch to the user identified by email. Returns false if no
 * matching user is found (silent no-op so Stripe will not retry).
 *
 * @param email - Normalized email
 * @param $set - MongoDB-style $set fields
 * @returns True if a user was patched
 */
async function applyUserPatch(email: string, $set: UserSetFields): Promise<boolean> {
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

  const s = stripe;
  if (!s) return c.json({ error: 'Stripe is not configured' }, 503);

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: 'Missing signature' }, 400);

  const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;
  if (!endpointSecret) return c.json({ error: 'Stripe is not configured' }, 503);

  const rawBody = await c.req.arrayBuffer();
  const body = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = await s.webhooks.constructEventAsync(body, signature, endpointSecret);
    logger.debug('Webhook event received', { type: event.type });
  } catch (e) {
    logger.error('Webhook signature verification failed', { error: errorMessage(e) });
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
      const subLike = toSubscriptionEvent(eventObject);
      const { customer: stripeID, status } = subLike;
      if (!stripeID) {
        logger.error('Webhook missing customer ID', { type: event.type });
        return c.body(null, 400);
      }
      const email = await resolveCustomerEmail(stripeID);
      if (!email) return c.body(null, 400);
      const expires = getSubscriptionPeriodEnd(subLike);
      if (expires === null) {
        logger.error('Webhook: subscription event has no current_period_end', { type: event.type, eventId: event.id });
      }
      const ok = await applyUserPatch(email, { subscription: { stripeID, expires, status } });
      if (ok) logger.info('Subscription updated', { type: event.type, email, status });
    }

    if (event.type === "checkout.session.completed") {
      const { customer: stripeID, customer_email, subscription: subscriptionId } = eventObject as { customer?: string; customer_email?: string | null; subscription?: string };
      if (subscriptionId && stripeID) {
        const [subscription, email] = await Promise.all([
          s.subscriptions.retrieve(subscriptionId),
          customer_email ? Promise.resolve(customer_email.toLowerCase()) : resolveCustomerEmail(stripeID)
        ]);
        if (email) {
          const ok = await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          if (ok) logger.info('Checkout completed', { email, status: subscription.status });
        }
      }
    }

    if (event.type === "invoice.paid") {
      const invoice = eventObject as {
        customer?: string;
        subscription?: string;
        parent?: { subscription_details?: { subscription?: string } };
      };
      const stripeID = invoice.customer;
      // Basil (2025-03-31+) moved the invoice's subscription id under parent.subscription_details.
      const subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
      if (subscriptionId && stripeID) {
        const [subscription, email] = await Promise.all([
          s.subscriptions.retrieve(subscriptionId),
          resolveCustomerEmail(stripeID)
        ]);
        if (email) {
          const ok = await applyUserPatch(email, { subscription: buildSubscriptionPatch(stripeID, subscription) });
          if (ok) logger.info('Invoice paid', { email });
        }
      }
    }

    if (event.type === "invoice.payment_failed") {
      const { customer: stripeID } = eventObject as { customer?: string };
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
    logger.error('Webhook processing error', { error: errorMessage(e) });
    return c.body(null, 500);
  }
});

// ==== STATIC ROUTES ====
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

/**
 * Integration test route handler that throws intentionally (test env only).
 *
 * @returns never
 */
function __testIntegrationErrorHandler(): never {
  throw new Error('Intentional integration test error');
}

if (process.env.NODE_ENV === 'test') {
  app.get('/api/__integration_error_test__', __testIntegrationErrorHandler);
}

/**
 * Sanitize a user-update field value for persistence.
 *
 * @param value - Raw request value
 * @returns Escaped string or original non-string value
 */
export function __testSanitizeUserUpdateValue(value: unknown): unknown {
  return typeof value === 'string' ? escapeHtml(value.trim()) : value;
}

/**
 * Resolve usage object from a user record with defaults.
 *
 * @param user - User record from database
 * @returns Usage snapshot
 */
export function __testResolveUsage(user: { usage?: { count: number; reset_at: number | null } }): { count: number; reset_at: number | null } {
  return user.usage || { count: 0, reset_at: null };
}

/**
 * Resolve post-increment usage count from an updated user record.
 *
 * @param updatedUser - User record after increment
 * @returns Usage count, defaulting to 1 when missing
 */
export function __testResolveActualCount(updatedUser: { usage?: { count: number } } | null | undefined): number {
  return updatedUser?.usage?.count || 1;
}

/**
 * Parse JSON request body with proper error handling
 *
 * Returns parsed JSON or null if parsing fails. Sets 400 response on failure.
 * Handles SyntaxError from malformed JSON.
 *
 * @async
 * @param c - Hono context
 * @returns Parsed body or null on error
 */
async function parseJsonBody<T = Record<string, unknown>>(c: Context<AppEnv>): Promise<T | null> {
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
    const body = await parseJsonBody<{ email: string; password: string; name: string }>(c);
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
        logger.error('Auth insert failed, rolling back user creation', { error: errorMessage(authError) });
        try {
          const rollback = await db.deleteUser({ _id: insertID });
          if (rollback.deletedCount !== 1) {
            logger.error('Rollback failed - orphaned user record', { userID: insertID });
          }
        } catch (rollbackError) {
          logger.error('Rollback failed - orphaned user record', { userID: insertID, error: errorMessage(rollbackError) });
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
      const isDuplicate = (e instanceof Error && (e.message.includes('UNIQUE constraint failed') || e.message.includes('duplicate key')))
        || (typeof e === 'object' && e !== null && 'code' in e && e.code === 11000);
      if (isDuplicate) {
        logger.warn('Signup failed - duplicate account');
        return c.json({ error: "Unable to create account with provided credentials" }, 400);
      }
      throw e;
    }
  } catch (e) {
    logger.error('Signup error', { error: errorMessage(e) });
    return c.json({ error: "Server error" }, 500);
  }
});

app.post("/api/signin", async (c) => {
  try {
    const body = await parseJsonBody<{ email: string; password: string }>(c);
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
        logger.warn('Password rehash failed', { error: errorMessage(e) });
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
    logger.error('Signin error', { error: errorMessage(e) });
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
    logger.error('Signout error', { error: errorMessage(e) });
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
    const body = await c.req.json<Record<string, unknown>>();
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
    const update: UserSetFields = {};
    for (const [key, value] of Object.entries(body)) {
      if (UPDATEABLE_USER_FIELDS.includes(key)) {
        // Sanitize string values to prevent XSS
        update[key] = __testSanitizeUserUpdateValue(value) as string;
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
    logger.error('Update user error', { error: errorMessage(err) });
    return c.json({ error: "Failed to update user" }, 500);
  }
});

// ==== USAGE TRACKING ====
app.post("/api/usage", authMiddleware, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json<{ operation?: string }>();
    const { operation } = body; // "check" or "track"

    if (!operation || !['check', 'track'].includes(operation)) {
      return c.json({ error: "Invalid operation. Must be 'check' or 'track'" }, 400);
    }

    // Get user
    const user = await db.findUser( { _id: userID });
    if (!user) return c.json({ error: "User not found" }, 404);

    // Check if user is a subscriber - subscribers get unlimited
    const { subscription } = user;
    const isSubscriber = subscription?.status === 'active' &&
      (!subscription.expires || subscription.expires > Math.floor(Date.now() / 1000));

    if (isSubscriber && subscription) {
      return c.json({
        remaining: -1,
        total: -1,
        isSubscriber: true,
        subscription: {
          status: subscription.status,
          expiresAt: subscription.expires ? new Date(subscription.expires * 1000).toISOString() : null
        }
      });
    }

    // Get usage limit from environment
    const limit = parseInt(process.env.FREE_USAGE_LIMIT || '20');
    const now = Math.floor(Date.now() / 1000);

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
    logger.error('Usage tracking error', { error: errorMessage(error) });
    return c.json({ error: "Server error" }, 500);
  }
});

// ==== PAYMENT ROUTES ====
app.post("/api/checkout", authMiddleware, csrfProtection, async (c) => {
  try {
    const s = stripe;
    if (!s) return c.json({ error: 'Stripe is not configured' }, 503);

    const userID = c.get('userID');
    const body = await c.req.json<{ email?: string; lookup_key?: string }>();
    const { email, lookup_key } = body;

    if (!email || !lookup_key) return c.json({ error: "Missing email or lookup_key" }, 400);

    // Verify the email matches the authenticated user
    const user = await db.findUser( { _id: userID });
    if (!user || user.email !== email) return c.json({ error: "Email mismatch" }, 403);

    const prices = await s.prices.list({ lookup_keys: [lookup_key], expand: ["data.product"] });

    if (!prices.data || prices.data.length === 0) {
      return c.json({ error: `No price found for lookup_key: ${lookup_key}` }, 400);
    }

    // Use FRONTEND_URL env var or origin header, fallback to localhost for dev
    const origin = process.env.FRONTEND_URL || c.req.header('origin') || `http://localhost:${port}`;

    const session = await s.checkout.sessions.create({
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
    logger.error('Checkout session error', { error: errorMessage(e) });
    return c.json({ error: "Stripe session failed" }, 500);
  }
});

app.post("/api/portal", authMiddleware, csrfProtection, async (c) => {
  try {
    const s = stripe;
    if (!s) return c.json({ error: 'Stripe is not configured' }, 503);

    const userID = c.get('userID');
    const body = await c.req.json<{ customerID?: string }>();
    const { customerID } = body;

    if (!customerID) return c.json({ error: "Missing customerID" }, 400);

    // Verify the customerID matches the authenticated user's subscription
    const user = await db.findUser( { _id: userID });
    if (!user || (user.subscription?.stripeID && user.subscription.stripeID !== customerID)) {
      return c.json({ error: "Unauthorized customerID" }, 403);
    }

    // Use FRONTEND_URL env var or origin header, fallback to localhost for dev
    const origin = process.env.FRONTEND_URL || c.req.header('origin') || `http://localhost:${port}`;
    const portalSession = await s.billingPortal.sessions.create({
      customer: customerID,
      return_url: `${origin}/app/payment?portal=return`,
    });
    return c.json({ url: portalSession.url, id: portalSession.id });
  } catch (e) {
    logger.error('Portal session error', { error: errorMessage(e) });
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
let server: ReturnType<typeof serve> | null = null;

/**
 * Log successful server startup.
 *
 * @param info - Server listen info from @hono/node-server
 * @returns void
 */
export function __testOnServerStarted(info: { port: number }): void {
  logger.info('Server started successfully', {
    port: info.port,
    environment: !isProd() ? 'development' : 'production'
  });
}

type ShutdownOptions = {
  exit?: (code: number) => void;
  setForceExitTimeout?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
};

/**
 * Gracefully shut down HTTP server and database connections.
 *
 * @param httpServer - HTTP server instance
 * @param signal - Signal name (SIGTERM, SIGINT)
 * @param options - Shutdown options for tests
 * @returns void
 */
export function __testGracefulShutdown(
  httpServer: { close: (cb: () => void) => void },
  signal: string,
  options: ShutdownOptions = {}
): void {
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
 * Register SIGTERM/SIGINT handlers for graceful shutdown.
 *
 * @param httpServer - HTTP server instance
 * @returns void
 */
export function __testRegisterGracefulShutdown(httpServer: { close: (cb: () => void) => void }): void {
  if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => __testGracefulShutdown(httpServer, 'SIGTERM'));
    process.on('SIGINT', () => __testGracefulShutdown(httpServer, 'SIGINT'));
  }
}

let __testServeFactory: typeof serve = serve;

/**
 * Replace the HTTP server factory used by default startup (tests only).
 *
 * @param factory - Injectable serve implementation
 * @returns void
 */
export function __testSetServeFactory(factory: typeof serve): void {
  __testServeFactory = factory;
}

/**
 * Start HTTP server and register graceful shutdown handlers.
 *
 * @param serveFn - Server factory
 * @returns HTTP server instance
 */
export function __testStartHttpServer(serveFn: typeof serve = __testServeFactory) {
  const httpServer = serveFn({
    fetch: app.fetch,
    port,
    hostname: '::'
  }, __testOnServerStarted);

  __testRegisterGracefulShutdown(httpServer);
  return httpServer;
}

/**
 * Start HTTP server when startup is enabled.
 *
 * @param shouldStart - Whether startup hooks are active
 * @param serveFn - Server factory
 * @returns HTTP server instance or null
 */
export function __testStartHttpServerIfNeeded(
  shouldStart: boolean = shouldStartServer,
  serveFn: typeof serve = __testServeFactory
) {
  if (!shouldStart) return null;
  return __testStartHttpServer(serveFn);
}

server = __testStartHttpServerIfNeeded();

/**
 * Replace the module-level Stripe client (for integration tests only).
 *
 * @param stripeClient - Mock or real Stripe instance
 * @returns void
 */
export function setStripeForTests(stripeClient: Stripe | null): void {
  stripe = stripeClient;
}

export {
  app,
  db,
  config,
  stripe,
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
