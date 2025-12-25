// ==== IMPORTS ====
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { secureHeaders } from 'hono/secure-headers'
import { cors } from 'hono/cors'
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";

import { databaseManager } from "./adapters/manager.js";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, stat, readFileSync, writeFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';

// ==== RATE LIMITING ====
const rateLimitStore = new Map();

// ==== CSRF PROTECTION ====
const csrfTokenStore = new Map(); // userID -> { token, timestamp }
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function csrfProtection(c, next) {
  // Skip CSRF for GET requests and auth routes (signup/signin set the token)
  if (c.req.method === 'GET' || c.req.path === '/api/signup' || c.req.path === '/api/signin') {
    return next();
  }

  const csrfToken = c.req.header('x-csrf-token');
  const userID = c.get('userID'); // Set by authMiddleware

  if (!csrfToken || !userID) {
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  const storedData = csrfTokenStore.get(userID);
  if (!storedData) {
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  // Use timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(csrfToken);
  const storedBuffer = Buffer.from(storedData.token);
  if (tokenBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, storedBuffer)) {
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  // Check if token is expired
  if (Date.now() - storedData.timestamp > CSRF_TOKEN_EXPIRY) {
    csrfTokenStore.delete(userID);
    return c.json({ error: 'CSRF token expired' }, 403);
  }

  await next();
}

const rateLimiter = (maxRequests, windowMs, routeName = 'unknown') => {
  return async (c, next) => {
    // Use X-Forwarded-For when behind proxy, fallback to remote address
    const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }

    const requests = rateLimitStore.get(key);
    // Remove old requests outside the window
    const validRequests = requests.filter(time => time > windowStart);

    if (validRequests.length >= maxRequests) {
      console.error(`[${new Date().toISOString()}] RATE LIMIT EXCEEDED: IP ${key} blocked on ${routeName} (${validRequests.length}/${maxRequests} requests in ${windowMs/1000}s window)`);
      return c.json({
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((windowStart + windowMs - now) / 1000)
      }, 429);
    }

    validRequests.push(now);
    rateLimitStore.set(key, validRequests);
    await next();
  };
};

// Define limiters
const authLimiter = rateLimiter(10, 15 * 60 * 1000, 'auth routes'); // 10 requests per 15 minutes
const globalLimiter = rateLimiter(300, 15 * 60 * 1000, 'global'); // 300 requests per 15 minutes
const paymentLimiter = rateLimiter(5, 15 * 60 * 1000, 'payment routes'); // 5 requests per 15 minutes

// Cleanup old rate limit entries every hour to prevent memory leak
setInterval(() => {
  const now = Date.now();
  const maxWindow = 15 * 60 * 1000; // 15 minutes (largest window)
  let cleaned = 0;

  for (const [ip, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(time => time > now - maxWindow);
    if (validRequests.length === 0) {
      rateLimitStore.delete(ip);
      cleaned++;
    } else {
      rateLimitStore.set(ip, validRequests);
    }
  }

  if (cleaned > 0) {
    console.log(`[${new Date().toISOString()}] Rate limit cleanup: removed ${cleaned} inactive IPs`);
  }
}, 60 * 60 * 1000); // Run every hour

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

  if (cleaned > 0) {
    console.log(`[${new Date().toISOString()}] CSRF cleanup: removed ${cleaned} expired tokens`);
  }
}, 60 * 60 * 1000); // Run every hour

// ==== CONFIG & ENV ====
// Environment setup - MUST happen before config loading
if (!isProd()) {
  loadLocalENV();
} else {
  setInterval(async () => {
    console.log(`Hourly Completed at ${new Date().toLocaleTimeString()}`);
  }, 60 * 60 * 1000); // Every hour
}

// Environment variable resolution function
function resolveEnvironmentVariables(str) {
  if (typeof str !== 'string') return str;

  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      console.warn(`Environment variable ${varName} is not defined, using placeholder: ${match}`);
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
  console.error('Failed to load config:', err);
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

// Validate required environment variables
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
    console.warn("⚠️  Missing environment variables (server will continue with limited functionality):");
    missing.forEach(varName => console.warn(`   - ${varName}`));
    console.warn("\n💡 For full functionality, set these environment variables:");
    console.warn("   - DATABASE_URL (general database connection)");
    console.warn("   - MONGODB_URL (MongoDB connection)");
    console.warn("   - POSTGRES_URL (PostgreSQL connection)");
    console.warn("   - STRIPE_KEY (Stripe payments)");
    console.warn("   - JWT_SECRET (authentication)");
    console.warn("\n🔄 Server continuing with fallback/default values...\n");

    // Don't exit - let the server continue with warnings
    return false;
  }

  return true;
}

const envValidationPassed = validateEnvironmentVariables();

if (envValidationPassed) {
  console.log('✅ Environment variables validated successfully');
}

console.log('Single-client backend initialized');

// Development mode check
const isDevelopment = process.env.NODE_ENV !== 'production';

// Structured logging system (no external dependencies)
const logger = {
  error: (message, meta = {}) => {
    const logEntry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.error(isDevelopment ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  warn: (message, meta = {}) => {
    const logEntry = {
      level: 'WARN',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.warn(isDevelopment ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  info: (message, meta = {}) => {
    const logEntry = {
      level: 'INFO',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(isDevelopment ? JSON.stringify(logEntry, null, 2) : JSON.stringify(logEntry));
  },

  debug: (message, meta = {}) => {
    if (!isDevelopment) return;
    const logEntry = {
      level: 'DEBUG',
      timestamp: new Date().toISOString(),
      message,
      ...meta
    };
    console.log(JSON.stringify(logEntry, null, 2));
  }
};

// Log server initialization
logger.info('Server initialization started', {
  environment: isDevelopment ? 'development' : 'production'
});

// ==== DATABASE CONFIG ====
// Single database configuration - no origin-based routing needed
const dbConfig = config.database;

// ==== SERVICES SETUP ====
// Stripe setup (only if key is available)
let stripe = null;
if (STRIPE_KEY) {
  stripe = new Stripe(STRIPE_KEY);
} else {
  console.warn('⚠️  STRIPE_KEY not set - Stripe functionality will be disabled');
}

// Single database config - always use the same one
const currentDbConfig = dbConfig;

// ==== HONO SETUP ====
const app = new Hono();

// Get __dirname for static file serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CORS middleware (needed for development when frontend is on different port)
// Use CORS_ORIGINS env var in production, fallback to localhost for development
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:8000'];

app.use('*', cors({
  origin: corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  credentials: true
}));

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
  strictTransportSecurity: isDevelopment ? false : 'max-age=31536000; includeSubDomains; preload',
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

// Global rate limiter
app.use('*', globalLimiter);

// Request logging middleware (dev only)
app.use('*', async (c, next) => {
  if (isDevelopment) {
    const requestId = Math.random().toString(36).substr(2, 9);
    console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.path} - ID: ${requestId}`);
  }
  await next();
});

const tokenExpirationDays = 30;

// ==== BCRYPT HELPERS ====
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// ==== JWT HELPERS ====
function tokenExpireTimestamp(){
  return Math.floor(Date.now() / 1000) + tokenExpirationDays * 24 * 60 * 60; // 30 days from now
}

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
    console.error("Token generation error:", error);
    throw error;
  }
}

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
    c.set('userID', payload.userID);
    await next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.error(`[${new Date().toISOString()}] Token expired:`, error.message);
      return c.json({ error: "Token expired" }, 401);
    }
    console.error(`[${new Date().toISOString()}] Token verification error:`, error);
    return c.json({ error: "Invalid token" }, 401);
  }
}

function generateUUID() {
  return crypto.randomUUID();
}

// ==== VALIDATION & SANITIZATION ====
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

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 6 || password.length > 72) return false; // bcrypt limit
  return true;
};

const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  if (name.trim().length === 0 || name.length > 100) return false;
  return true;
};

// ==== STRIPE WEBHOOK (raw body needed) ====
app.post("/api/payment", async (c) => {
  console.log("Payment webhook received");

  const signature = c.req.header("stripe-signature");
  const rawBody = await c.req.arrayBuffer();
  const body = Buffer.from(rawBody);

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, process.env.STRIPE_ENDPOINT_SECRET);
    console.log("Webhook event:", event);
  } catch (e) {
    console.error("Webhook signature verification failed:", e.message);
    return c.body(null, 400);
  }

  // Use the single database config for webhooks
  const webhookConfig = currentDbConfig;
  const { customer: stripeID, current_period_end, status } = event.data.object;
  const customer = await stripe.customers.retrieve(stripeID);
  const customerEmail = customer.email.toLowerCase();

  if (["customer.subscription.deleted", "customer.subscription.updated","customer.subscription.created"].includes(event.type)) {
    console.log(`Webhook: ${event.type} for ${customerEmail}`);
    const user = await databaseManager.findUser(webhookConfig.dbType, webhookConfig.db, webhookConfig.connectionString, { email: customerEmail });
    if (user) {
      await databaseManager.updateUser(webhookConfig.dbType, webhookConfig.db, webhookConfig.connectionString, { email: customerEmail }, {
        $set: { subscription: { stripeID, expires: current_period_end, status } }
      });
    } else {
      console.warn(`Webhook: No user found for email ${customerEmail}`);
    }
  }
  return c.body(null, 200);
});

// ==== STATIC ROUTES ====
app.get("/api/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// ==== AUTH ROUTES ====
app.post("/api/signup", authLimiter, async (c) => {
  try {
    const body = await c.req.json();
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
      const result = await databaseManager.insertUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, {
        _id: insertID,
        email: email,
        name: name,
        created_at: Date.now()
      });

      const token = await generateToken(insertID);
      await databaseManager.insertAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email, password: hash, userID: insertID });

      // Generate CSRF token
      const csrfToken = generateCSRFToken();
      csrfTokenStore.set(insertID.toString(), { token: csrfToken, timestamp: Date.now() });

      // Set HttpOnly cookie
      setCookie(c, 'token', token, {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'Strict',
        path: '/',
        maxAge: tokenExpirationDays * 24 * 60 * 60
      });

      // Set CSRF token cookie (readable by frontend)
      setCookie(c, 'csrf_token', csrfToken, {
        httpOnly: false,
        secure: !isDevelopment,
        sameSite: 'Lax',
        path: '/',
        maxAge: CSRF_TOKEN_EXPIRY / 1000
      });

      console.log(`[${new Date().toISOString()}] Signup success`);

      return c.json({
        id: insertID.toString(),
        email: email,
        name: name.trim(),
        tokenExpires: tokenExpireTimestamp()
      }, 201);
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('duplicate key') || e.code === 11000) {
        console.log(`[${new Date().toISOString()}] Signup failed - duplicate account`);
        return c.json({ error: "Unable to create account with provided credentials" }, 400);
      }
      throw e;
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Signup error:`, e.message);
    return c.json({ error: "Server error" }, 500);
  }
});

app.post("/api/signin", authLimiter, async (c) => {
  try {
    const body = await c.req.json();
    let { email, password } = body;

    // Validation
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid credentials' }, 400);
    }
    if (!password || typeof password !== 'string') {
      return c.json({ error: 'Invalid credentials' }, 400);
    }

    email = email.toLowerCase().trim();
    console.log(`[${new Date().toISOString()}] Attempting signin`);

    // Check if auth exists
    const auth = await databaseManager.findAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email });
    if (!auth) {
      console.log(`[${new Date().toISOString()}] Auth record not found`);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    //verify
    if (!(await verifyPassword(password, auth.password))) {
      console.log(`[${new Date().toISOString()}] Password verification failed`);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // get user
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email });
    if (!user) {
      console.error("User not found for auth record");
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // generate token
    const token = await generateToken(user._id.toString());

    // Generate CSRF token
    const csrfToken = generateCSRFToken();
    csrfTokenStore.set(user._id.toString(), { token: csrfToken, timestamp: Date.now() });

    // Set HttpOnly cookie
    setCookie(c, 'token', token, {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: 'Strict',
      path: '/',
      maxAge: tokenExpirationDays * 24 * 60 * 60
    });

    // Set CSRF token cookie (readable by frontend)
    setCookie(c, 'csrf_token', csrfToken, {
      httpOnly: false,
      secure: !isDevelopment,
      sameSite: 'Lax',
      path: '/',
      maxAge: CSRF_TOKEN_EXPIRY / 1000
    });

    console.log(`[${new Date().toISOString()}] Signin success`);

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
    console.error(`[${new Date().toISOString()}] Signin error:`, e);
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
      secure: !isDevelopment,
      sameSite: 'Strict',
      path: '/'
    });

    // Clear the CSRF token cookie
    deleteCookie(c, 'csrf_token', {
      httpOnly: false,
      secure: !isDevelopment,
      sameSite: 'Lax',
      path: '/'
    });

    console.log(`[${new Date().toISOString()}] Signout success for userID: ${userID}`);
    return c.json({ message: "Signed out successfully" });
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Signout error:`, e);
    return c.json({ error: "Server error" }, 500);
  }
});

// ==== USER DATA ROUTES ====
app.get("/api/me", authMiddleware, async (c) => {
  const userID = c.get('userID');
  const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
  console.log("/me checking for user with ID:", userID);
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
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
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
    const result = await databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID }, { $set: update });

    if (result.modifiedCount === 0) {
      return c.json({ error: "No changes made" }, 400);
    }

    // Return updated user
    const updatedUser = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
    return c.json(updatedUser);
  } catch (err) {
    console.error("Update user error:", err);
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
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
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
      usage = {
        count: 0,
        reset_at: now + (30 * 24 * 60 * 60) // 30 days from now
      };
      await databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString,
        { _id: userID },
        { $set: { usage } }
      );
    }

    if (operation === 'track') {
      // Check if at limit
      if (usage.count >= limit) {
        return c.json({
          error: "Usage limit reached",
          remaining: 0,
          total: limit,
          isSubscriber: false
        }, 429);
      }

      // Increment count
      usage.count += 1;
      await databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString,
        { _id: userID },
        { $set: { usage } }
      );
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
    console.error('Usage tracking error:', error);
    return c.json({ error: "Server error" }, 500);
  }
});

// ==== PAYMENT ROUTES ====
app.post("/api/checkout", paymentLimiter, authMiddleware, csrfProtection, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { email, lookup_key } = body;

    if (!email || !lookup_key) return c.json({ error: "Missing email or lookup_key" }, 400);

    // Verify the email matches the authenticated user
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
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
    console.error("Checkout session error:", e.message);
    return c.json({ error: "Stripe session failed" }, 500);
  }
});

app.post("/api/portal", paymentLimiter, authMiddleware, csrfProtection, async (c) => {
  try {
    const userID = c.get('userID');
    const body = await c.req.json();
    const { customerID } = body;

    if (!customerID) return c.json({ error: "Missing customerID" }, 400);

    // Verify the customerID matches the authenticated user's subscription
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: userID });
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
    console.error("Portal session error:", e.message);
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
    stack: isDevelopment ? err.stack : undefined,
    path: c.req.path,
    method: c.req.method,
    requestId
  });

  return c.json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  }, 500);
});

// ==== UTILITY FUNCTIONS ====
function isProd() {
  if (typeof process.env.ENV === "undefined") {
    return false
  } else if (process.env.ENV === "production") {
    return true
  } else {
    return false
  }
}

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
      console.error('Failed to create .env from template:', exampleErr);
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
    console.error('Failed to load .env file:', err);
  }
}

// ==== SERVER STARTUP ====
const port = parseInt(process.env.PORT || "8000");

const server = serve({
  fetch: app.fetch,
  port,
  hostname: '::'  // Listen on both IPv4 and IPv6
}, (info) => {
  logger.info('Server started successfully', {
    port: info.port,
    environment: isDevelopment ? 'development' : 'production'
  });
});

// Handle graceful shutdown on SIGTERM and SIGINT - NEED THIS FOR PROXY
if (typeof process !== 'undefined') {
  const gracefulShutdown = async (signal) => {
    console.log(`${signal} received. Shutting down gracefully...`);

    // Close HTTP server first
    server.close(async () => {
      console.log('Server closed');

      // Close all database connections
      await databaseManager.closeAll();
      console.log('Database connections closed');

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
