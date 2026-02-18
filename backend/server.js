// ==== IMPORTS ====
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { databaseManager } from "./adapters/manager.js";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, stat, readFileSync, writeFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';

// ==== SERVER CONFIG ====
const port = parseInt(process.env.PORT || "8000");

// ==== STRUCTURED LOGGING ====
// Defined early so all code can use it (no external dependencies)
const logger = {
  error: (message, meta = {}) => {
    const logEntry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.error(!isProd() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  warn: (message, meta = {}) => {
    const logEntry = {
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.warn(!isProd() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  info: (message, meta = {}) => {
    const logEntry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(!isProd() ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  debug: (message, meta = {}) => {
    if (isProd()) return;
    const logEntry = {
      level: 'DEBUG',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(JSON.stringify(logEntry, null, 2));
  }
};

// ==== CSRF PROTECTION ====
const csrfTokenStore = new Map(); // userID -> { token, timestamp }
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const CSRF_MAX_ENTRIES = 50000; // LRU eviction threshold

/**
 * LRU eviction helper that removes oldest entries when over limit
 *
 * Prevents memory leaks in rate limiter and CSRF stores by removing oldest
 * entries based on timestamp when store exceeds maxEntries threshold.
 *
 * @param {Map} store - Map to evict entries from
 * @param {number} maxEntries - Maximum entries before eviction
 * @param {Function} getTimestamp - Function to extract timestamp from value
 * @returns {void}
 */
function evictOldestEntries(store, maxEntries, getTimestamp) {
  if (store.size <= maxEntries) return;

  // Convert to array and sort by timestamp
  const entries = Array.from(store.entries())
    .map(([key, value]) => ({ key, timestamp: getTimestamp(value) }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Remove oldest entries until under limit
  const toRemove = store.size - maxEntries;
  for (let i = 0; i < toRemove; i++) {
    store.delete(entries[i].key);
  }
}

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

// Cleanup expired CSRF tokens every hour to prevent memory leak
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [userID, data] of csrfTokenStore.entries()) {
    if (now - data.timestamp > CSRF_TOKEN_EXPIRY) {
      csrfTokenStore.delete(userID);
      cleaned++;
    }
  }

  // LRU eviction if still over limit
  evictOldestEntries(csrfTokenStore, CSRF_MAX_ENTRIES, (data) => data.timestamp);

  if (cleaned > 0) {
    logger.debug('CSRF cleanup completed', { removedTokens: cleaned });
  }
}, 60 * 60 * 1000); // Run every hour

// ==== RATE LIMITING ====
const rateLimitStore = new Map(); // key -> { count, resetAt }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ENTRIES = 100000; // LRU eviction threshold

// Route-specific rate limits
const RATE_LIMITS = {
  auth: { limit: 10, window: RATE_LIMIT_WINDOW },       // /api/signin, /api/signup
  payment: { limit: 5, window: RATE_LIMIT_WINDOW },     // /api/checkout, /api/portal
  global: { limit: 300, window: RATE_LIMIT_WINDOW }     // all other /api routes
};

/**
 * Get client IP address from request
 *
 * Checks X-Forwarded-For header first (for proxies), falls back to
 * socket address. Handles comma-separated forwarded IPs.
 *
 * @param {Context} c - Hono context
 * @returns {string} Client IP address
 */
function getClientIP(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return c.req.raw?.socket?.remoteAddress || 'unknown';
}

/**
 * Get rate limit category for a given path
 *
 * @param {string} path - Request path
 * @returns {string} Rate limit category: 'auth', 'payment', or 'global'
 */
function getRateLimitCategory(path) {
  if (path === '/api/signin' || path === '/api/signup') {
    return 'auth';
  }
  if (path === '/api/checkout' || path === '/api/portal') {
    return 'payment';
  }
  return 'global';
}

/**
 * Rate limiting middleware
 *
 * Tracks requests per IP+category with sliding window. Returns 429 when
 * limit exceeded. Adds X-RateLimit-Remaining and Retry-After headers.
 *
 * @async
 * @param {Context} c - Hono context
 * @param {Function} next - Next middleware function
 * @returns {Promise<Response|void>} 429 error or continues to next middleware
 */
async function rateLimitMiddleware(c, next) {
  // Skip rate limiting for health check and static files
  if (c.req.path === '/api/health' || !c.req.path.startsWith('/api/')) {
    return next();
  }

  const ip = getClientIP(c);
  const category = getRateLimitCategory(c.req.path);
  const { limit, window } = RATE_LIMITS[category];
  const key = `${ip}:${category}`;
  const now = Date.now();

  let record = rateLimitStore.get(key);

  // Reset if window expired
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + window };
    rateLimitStore.set(key, record);
  }

  record.count++;

  // Check if over limit
  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    c.header('Retry-After', String(retryAfter));
    c.header('X-RateLimit-Remaining', '0');
    logger.info('Rate limit exceeded', { ip, category, path: c.req.path });
    return c.json({ error: 'Too many requests' }, 429);
  }

  c.header('X-RateLimit-Remaining', String(limit - record.count));
  await next();
}

// Cleanup expired rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  // LRU eviction if still over limit
  evictOldestEntries(rateLimitStore, RATE_LIMIT_MAX_ENTRIES, (data) => data.resetAt);

  if (cleaned > 0) {
    logger.debug('Rate limit cleanup completed', { removedEntries: cleaned });
  }
}, 15 * 60 * 1000);

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

// Cleanup expired lockout entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [email, record] of loginAttemptStore.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      loginAttemptStore.delete(email);
      cleaned++;
    }
  }

  // LRU eviction if still over limit
  evictOldestEntries(loginAttemptStore, LOCKOUT_MAX_ENTRIES, (data) => data.lockedUntil || 0);

  if (cleaned > 0) {
    logger.debug('Lockout cleanup completed', { removedEntries: cleaned });
  }
}, 15 * 60 * 1000);

// ==== CONFIG & ENV ====
// Environment setup - MUST happen before config loading
if (!isProd()) {
  loadLocalENV();
} else {
  setInterval(async () => {
    logger.debug('Hourly task completed');
  }, 60 * 60 * 1000); // Every hour
}

/**
 * Resolve environment variable placeholders in configuration strings
 *
 * Replaces ${VAR_NAME} patterns with process.env values. Logs warning
 * and preserves placeholder if environment variable is undefined.
 *
 * @param {string} str - String with ${VAR_NAME} placeholders
 * @returns {string} String with placeholders replaced
 */
function resolveEnvironmentVariables(str) {
  if (typeof str !== 'string') return str;

  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      logger.warn('Environment variable not defined, using placeholder', { varName, placeholder: match });
      return match; // Return the placeholder if env var is not found
    }
    return envValue;
  });
}

// Load and process configuration
let config;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configPath = resolve(__dirname, './config.json');
  const configData = await promisify(readFile)(configPath);
  const rawConfig = JSON.parse(configData.toString());

  // Resolve environment variables in configuration
  config = {
    staticDir: rawConfig.staticDir || '../dist',
    database: {
      ...rawConfig.database,
      connectionString: resolveEnvironmentVariables(rawConfig.database.connectionString)
    }
  };
} catch (err) {
  logger.error('Failed to load config, using defaults', { error: err.message });
  config = {
    staticDir: '../dist',
    database: {
      db: "MyApp",
      dbType: "sqlite",
      connectionString: "./databases/MyApp.db"
    }
  };
}

const STRIPE_KEY = process.env.STRIPE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Validate required environment variables are set
 *
 * Checks for STRIPE_KEY, STRIPE_ENDPOINT_SECRET, JWT_SECRET, and any
 * unresolved ${VAR} references in database config. Logs warnings for
 * missing variables but does not exit the process.
 *
 * @returns {boolean} True if all required variables are present
 */
function validateEnvironmentVariables() {
  const missing = [];

  if (!STRIPE_KEY) missing.push('STRIPE_KEY');
  if (!process.env.STRIPE_ENDPOINT_SECRET) missing.push('STRIPE_ENDPOINT_SECRET');
  if (!JWT_SECRET) missing.push('JWT_SECRET');

  // Check for database environment variables that are referenced but not defined
  if (typeof config.database.connectionString === 'string') {
    const matches = config.database.connectionString.match(/\$\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const varName = match.slice(2, -1); // Remove ${ and }
        if (!process.env[varName]) {
          missing.push(`${varName} (referenced in database config)`);
        }
      });
    }
  }

  if (missing.length > 0) {
    logger.warn('Missing environment variables - server continuing with limited functionality', {
      missing,
      hint: 'Set DATABASE_URL, MONGODB_URL, POSTGRES_URL, STRIPE_KEY, JWT_SECRET for full functionality'
    });

    // Don't exit - let the server continue with warnings
    return false;
  }

  return true;
}

const envValidationPassed = validateEnvironmentVariables();

if (envValidationPassed) {
  logger.info('Environment variables validated successfully');
}

logger.info('Single-client backend initialized');

// ==== DATABASE CONFIG ====
// Single database configuration - no origin-based routing needed
const dbConfig = config.database;

// ==== SERVICES SETUP ====
// Stripe setup (only if key is available)
let stripe = null;
if (STRIPE_KEY) {
  stripe = new Stripe(STRIPE_KEY);
} else {
  logger.warn('STRIPE_KEY not set - Stripe functionality disabled');
}

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
  findWebhookEvent: (eventId) => databaseManager.findWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId),
  insertWebhookEvent: (eventId, eventType, processedAt) => databaseManager.insertWebhookEvent(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, eventId, eventType, processedAt),
  executeQuery: (queryObject) => databaseManager.executeQuery(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, queryObject)
};

// ==== HONO SETUP ====
const app = new Hono();

// Get __dirname for static file serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CORS middleware (needed for development when frontend is on different port)
// Use CORS_ORIGINS env var in production, fallback to localhost for development
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:8000'];

app.use('*', cors({
  origin: corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  credentials: true
}));

// Rate limiting middleware
app.use('*', rateLimitMiddleware);

// Apache Common Log Format middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  const method = c.req.method;
  const url = c.req.path;
  const status = c.res.status;
  const duration = Date.now() - start;

  console.log(`[${timestamp}] "${method} ${url}" ${status} (${duration}ms)`);
});

// Security headers middleware
app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "https:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"]
  },
  strictTransportSecurity: !isProd() ? false : 'max-age=31536000; includeSubDomains; preload',
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: []
  }
}));

// Request logging middleware (dev only)
app.use('*', async (c, next) => {
  if (!isProd()) {
    const requestId = Math.random().toString(36).substr(2, 9);
    logger.debug('Request received', { method: c.req.method, path: c.req.path, requestId });
  }
  await next();
});

const tokenExpirationDays = 30;

/**
 * Hash password using bcrypt with 10 salt rounds
 *
 * Generates salt and hashes password for secure storage. Uses bcrypt's
 * automatic salt generation.
 *
 * @async
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Bcrypt hashed password
 * @throws {Error} If bcrypt hashing fails
 */
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Verify password against bcrypt hash using timing-safe comparison
 *
 * @async
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Bcrypt hash to compare against
 * @returns {Promise<boolean>} True if password matches hash
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Calculate JWT expiration timestamp
 *
 * @returns {number} Unix timestamp 30 days in the future
 */
function tokenExpireTimestamp(){
  return Math.floor(Date.now() / 1000) + tokenExpirationDays * 24 * 60 * 60; // 30 days from now
}

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
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET not configured - authentication disabled");
    }

    const exp = tokenExpireTimestamp();
    const payload = { userID, exp };

    return jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      header: { alg: "HS256", typ: "JWT" }
    });
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
  if (!JWT_SECRET) {
    return c.json({ error: "Authentication service unavailable" }, 503);
  }

  // Read token from HttpOnly cookie
  const token = getCookie(c, 'token');
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
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
 * Generate RFC 4122 compliant UUID v4
 *
 * Uses crypto.randomUUID() for cryptographically secure unique identifiers.
 *
 * @returns {string} UUID string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Escape HTML special characters to prevent XSS attacks
 *
 * Replaces &, <, >, ", ', / with HTML entities. Returns original value
 * if not a string.
 *
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
};

/**
 * Validate email address format and length
 *
 * RFC 5321 compliant validation with robust regex checking local part,
 * domain, and TLD. Max length 254 characters. Prevents consecutive dots
 * and leading/trailing hyphens.
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321

  // More robust email validation:
  // - Local part: letters, numbers, and common special chars (no consecutive dots)
  // - Domain: letters, numbers, hyphens (no consecutive dots or leading/trailing hyphens)
  // - TLD: 2-63 characters
  const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$/;
  return emailRegex.test(email);
};

/**
 * Validate password length within bcrypt limits
 *
 * Enforces 6-72 character range (bcrypt's maximum is 72 bytes).
 *
 * @param {string} password - Password to validate
 * @returns {boolean} True if valid password length
 */
const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 6 || password.length > 72) return false; // bcrypt limit
  return true;
};

/**
 * Validate name length and non-empty after trim
 *
 * Enforces 1-100 character range after trimming whitespace.
 *
 * @param {string} name - Name to validate
 * @returns {boolean} True if valid name
 */
const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  if (name.trim().length === 0 || name.length > 100) return false;
  return true;
};

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
    maxAge: tokenExpirationDays * 24 * 60 * 60
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

    const { customer: stripeID, current_period_end, status } = event.data.object;

    // Validate required fields exist
    if (!stripeID) {
      logger.error('Webhook missing customer ID');
      return c.body(null, 400);
    }

    const customer = await stripe.customers.retrieve(stripeID);

    // Null check for customer email
    if (!customer || !customer.email) {
      logger.error('Webhook: Customer has no email', { stripeID });
      return c.body(null, 400);
    }

    const customerEmail = customer.email.toLowerCase();

    if (["customer.subscription.deleted", "customer.subscription.updated","customer.subscription.created"].includes(event.type)) {
      const user = await db.findUser({ email: customerEmail });
      if (user) {
        await db.updateUser({ email: customerEmail }, {
          $set: { subscription: { stripeID, expires: current_period_end, status } }
        });
      } else {
        logger.warn('Webhook: No user found for email');
      }
    }

    // Record successful processing for idempotency
    await db.insertWebhookEvent(event.id, event.type, Date.now());
    logger.info('Webhook processed successfully', { eventId: event.id, type: event.type });

    return c.body(null, 200);
  } catch (e) {
    logger.error('Webhook processing error', { error: e.message });
    return c.body(null, 500);
  }
});

// ==== STATIC ROUTES ====
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

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
        // Sanitize string values to prevent XSS
        update[key] = typeof value === 'string' ? escapeHtml(value.trim()) : value;
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
    let usage = user.usage || { count: 0, reset_at: null };

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
      const actualCount = updatedUser?.usage?.count || 1;

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
// All /api/* routes are handled above. Everything else is static/SPA.
const staticDir = resolve(__dirname, config.staticDir);

// Serve static assets - skip /api/* paths
app.use('*', async (c, next) => {
  // Skip API routes - they're handled by route handlers above
  if (c.req.path.startsWith('/api/')) {
    return next();
  }

  // Try to serve static file
  const staticMiddleware = serveStatic({ root: config.staticDir });
  return staticMiddleware(c, next);
});

// SPA fallback - serve index.html for client-side routing
app.get('*', async (c) => {
  // Skip API routes
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
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

// ==== UTILITY FUNCTIONS ====

/**
 * Check if the server is running in production mode
 *
 * Reads the NODE_ENV environment variable. Returns true only when
 * NODE_ENV is explicitly set to "production".
 *
 * @returns {boolean} True if NODE_ENV === "production"
 */
function isProd() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Load environment variables from local .env file
 *
 * Reads key=value pairs from backend/.env into process.env. Creates .env
 * from .env.example if it doesn't exist. Handles quoted values, comments,
 * and values containing '=' characters. Only called in non-production mode.
 *
 * @returns {void}
 */
function loadLocalENV() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const envFilePath = resolve(__dirname, './.env');
  const envExamplePath = resolve(__dirname, './.env.example');

  // Check if .env exists, if not create it from .env.example
  try {
    statSync(envFilePath);
  } catch (err) {
    // .env doesn't exist, try to create it from .env.example
    try {
      const exampleData = readFileSync(envExamplePath, 'utf8');
      writeFileSync(envFilePath, exampleData);
    } catch (exampleErr) {
      logger.error('Failed to create .env from template', { error: exampleErr.message });
      return;
    }
  }

  try {
    const data = readFileSync(envFilePath, 'utf8');
    const lines = data.split(/\r?\n/);
    for (let line of lines) {
      if (!line || line.trim().startsWith('#')) continue;

      // Split only on first = and handle quoted values
      let [key, ...valueParts] = line.split('=');
      let value = valueParts.join('='); // Rejoin in case value contains =

      if (key && value) {
        key = key.trim();
        value = value.trim();
        // Remove surrounding quotes if present
        value = value.replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    }
  } catch (err) {
    logger.error('Failed to load .env file', { error: err.message });
  }
}

// ==== SERVER STARTUP ====
const server = serve({
  fetch: app.fetch,
  port,
  hostname: '::'  // Listen on both IPv4 and IPv6
}, (info) => {
  logger.info('Server started successfully', {
    port: info.port,
    environment: !isProd() ? 'development' : 'production'
  });
});

// Handle graceful shutdown on SIGTERM and SIGINT - NEED THIS FOR PROXY
if (typeof process !== 'undefined') {
  const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down gracefully...`);

    // Close HTTP server first
    server.close(async () => {
      console.log('Server closed');

      // Close all database connections with error handling
      try {
        await databaseManager.closeAll();
        console.log('Database connections closed');
      } catch (err) {
        console.error('Error closing database connections:', err);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
