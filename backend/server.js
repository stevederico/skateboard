// ==== IMPORTS ====
import express from "express";
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
const csrfTokenStore = new Map(); // userID -> csrfToken

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

function csrfProtection(req, res, next) {
  // Skip CSRF for GET requests and auth routes (signup/signin set the token)
  if (req.method === 'GET' || req.path === '/signup' || req.path === '/signin') {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'];
  const userID = req.userID; // Set by authMiddleware

  if (!csrfToken || !userID || csrfTokenStore.get(userID) !== csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

const rateLimiter = (maxRequests, windowMs, routeName = 'unknown') => {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }
    
    const requests = rateLimitStore.get(key);
    // Remove old requests outside the window
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      console.error(`RATE LIMIT EXCEEDED: IP ${key} blocked on ${routeName} (${validRequests.length}/${maxRequests} requests in ${windowMs/1000}s window)`);
      return res.status(429).json({ 
        error: 'Too many requests, please try again later.',
        retryAfter: Math.ceil((windowStart + windowMs - now) / 1000)
      });
    }
    
    validRequests.push(now);
    rateLimitStore.set(key, validRequests);
    next();
  };
};

// Define limiters
const authLimiter = rateLimiter(10, 15 * 60 * 1000, 'auth routes'); // 10 requests per 15 minutes
const globalLimiter = rateLimiter(300, 15 * 60 * 1000, 'global'); // 300 requests per 15 minutes

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
    client: rawConfig.client,
    database: {
      ...rawConfig.database,
      connectionString: resolveEnvironmentVariables(rawConfig.database.connectionString)
    }
  };
} catch (err) {
  console.error('Failed to load config:', err);
  config = {
    client: "http://localhost:5173",
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

// ==== EXPRESS SETUP ====
const app = express();
const allowedOrigin = config.client;

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("Webhook received");

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    // req.body is a Buffer here, as required by Stripe
    event = await stripe.webhooks.constructEventAsync(req.body, signature, process.env.STRIPE_ENDPOINT_SECRET);
    console.log("Webhook event:", event);
  } catch (e) {
    console.error("Webhook signature verification failed:", e.message);
    return res.status(400).send();
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
  res.status(200).send();
});

// Apache Common Log Format middleware
app.use((req, res, next) => {
  res.on('finish', () => {
    const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    const method = req.method;
    const url = req.originalUrl;
    const httpVersion = `HTTP/${req.httpVersion}`;
    const status = res.statusCode;
    const contentLength = res.get('content-length') || '-';
    
    console.log(`[${timestamp}] "${method} ${url} ${httpVersion}" ${status} ${contentLength}`);
  });

  next();
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Security headers middleware (no external dependencies)
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  logger.debug('Applying security headers', { 
    path: req.path, 
    method: req.method,
    requestId 
  });
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  
  // HTTP Strict Transport Security (only in production)
  if (!isDevelopment) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    logger.debug('HSTS header applied (production only)', { requestId });
  }
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  
  logger.debug('Security headers applied successfully', { requestId });
  next();
});

// Apply rate limiting
app.use('/auth/', authLimiter);
app.use(globalLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.cookieParser());

// Apply CSRF protection to all routes after auth middleware
app.use(csrfProtection);

// Request logging middleware (dev only)
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  
  if (isDevelopment) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ID: ${requestId}`);
  }
  
  res.on('finish', () => {
    if (isDevelopment) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${Date.now() - start}ms) - ID: ${requestId}`);
    }
  });
  
  next();
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
  return Math.floor(Date.now() / 1000) + tokenExpirationDays * 24 * 60 * 60; // 1 week from now
}

// Remove the encoder and importKey since we'll use JWT_SECRET directly with jsonwebtoken
async function generateToken(userID) {
  try {
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET not configured - authentication disabled");
    }

    const exp = tokenExpireTimestamp();
    // SECURITY FIX: Remove database config from JWT payload
    // We don't need it since we always use the same database now
    const payload = { userID, exp }; // Clean, minimal payload

    // Use jsonwebtoken with exact same config as djwt
    return jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      header: { alg: "HS256", typ: "JWT" }
    });
  } catch (error) {
    console.error("Token generation error:", error);
    throw error;
  }
}

async function authMiddleware(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: "Authentication service unavailable" });
  }

  // Read token from HttpOnly cookie
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Use jsonwebtoken with exact same config as djwt
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    req.userID = payload.userID;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.error("Token expired:", error.message);
      return res.status(401).json({ error: "Token expired" });
    }
    console.error("Token verification error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ==== STATIC ROUTES ====
app.use("/public", express.static("./public"));

app.get("/", async (req, res) => {
  try {
    const file = await promisify(readFile)("./public/index.html");
    res.setHeader("Content-Type", "text/html");
    res.send(new TextDecoder().decode(file));
  } catch {
    res.status(200).send("Welcome to Skateboard API");
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: Date.now() }));

function generateUUID() {
  return crypto.randomUUID();
}

// ==== VALIDATION MIDDLEWARE ====
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

const validateSignup = (req, res, next) => {
  const { email, password, name } = req.body;

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format or length' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be 6-72 characters' });
  }

  if (!validateName(name)) {
    return res.status(400).json({ error: 'Name required (max 100 characters)' });
  }

  next();
};

const validateSignin = (req, res, next) => {
  const { email, password } = req.body;

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  next();
};

const validateUserUpdate = (req, res, next) => {
  const { name } = req.body;

  // Only validate if name is being updated
  if (name !== undefined && !validateName(name)) {
    return res.status(400).json({ error: 'Name must be 1-100 characters' });
  }

  next();
};

// ==== AUTH ROUTES ====
app.post("/signup", validateSignup, async (req, res) => {
  try {
    const origin = req.headers.origin;
    // No need to get database config - we always use the same one
    // const dbConfig = getDBConfig(origin);

    var { email, password, name } = req.body;
    email = email.toLowerCase().trim();

    const hash = await hashPassword(password);
    let insertID = generateUUID()

    try {
      const result = await databaseManager.insertUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, {
        _id: insertID,
        email: email,
        name: name.trim(),
        created_at: Date.now()
      });

      const token = await generateToken(insertID);
      await databaseManager.insertAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email, password: hash, userID: insertID });

      // Generate CSRF token
      const csrfToken = generateCSRFToken();
      csrfTokenStore.set(insertID.toString(), csrfToken);

      // Set HttpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: !isDevelopment,
        sameSite: 'strict',
        maxAge: tokenExpirationDays * 24 * 60 * 60 * 1000
      });

      res.status(201).json({
        id: insertID.toString(),
        email: email,
        name: name.trim(),
        tokenExpires: tokenExpireTimestamp(),
        csrfToken: csrfToken
      });
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('duplicate key') || e.code === 11000) {
        // Generic message to prevent user enumeration
        return res.status(400).json({ error: "Unable to create account with provided credentials" });
      }
      throw e;
    }
  } catch (e) {
    console.error("Signup error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/signin", validateSignin, async (req, res) => {
  try {
    const origin = req.headers.origin;
    // No need to get database config - we always use the same one
    // const dbConfig = getDBConfig(origin);

    var { email, password } = req.body;
    email = email.toLowerCase().trim();
    console.log(`[${new Date().toISOString()}] Attempting signin for email:`, email);

    // Check if auth exists
    const auth = await databaseManager.findAuth(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email });
    if (!auth) {
      console.log(`[${new Date().toISOString()}] Auth record not found for:`, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    //verify
    if (!(await verifyPassword(password, auth.password))) {
      console.log(`[${new Date().toISOString()}] Password verification failed for:`, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // get user
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { email: email });
    if (!user) {
      console.error("User not found for auth record:", auth);
      return res.status(404).json({ error: "User not found" });
    }

    // generate token
    const token = await generateToken(user._id.toString());

    // Generate CSRF token
    const csrfToken = generateCSRFToken();
    csrfTokenStore.set(user._id.toString(), csrfToken);

    // Set HttpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: 'strict',
      maxAge: tokenExpirationDays * 24 * 60 * 60 * 1000
    });

    res.json({
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
      tokenExpires: tokenExpireTimestamp(),
      csrfToken: csrfToken
    });
  } catch (e) {
    console.error("Signin error:", e);
    res.status(500).json({ error: "Server error" });
  }
});


// ==== USER DATA ROUTES ====
app.get("/me", authMiddleware, async (req, res) => {
  const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
  console.log("/me checking for user with ID:", req.userID);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
});

app.put("/me", authMiddleware, validateUserUpdate, async (req, res) => {
  try {
    // Whitelist of fields users are allowed to update
    const UPDATEABLE_USER_FIELDS = ['name'];

    // Find user first to verify existence
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Whitelist approach - only allow specific fields
    const update = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (UPDATEABLE_USER_FIELDS.includes(key)) {
        update[key] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Update user document
    const result = await databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID }, { $set: update });

    if (result.modifiedCount === 0) {
      return res.status(400).json({ error: "No changes made" });
    }

    // Return updated user
    const updatedUser = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
    return res.json(updatedUser);
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/isSubscriber", authMiddleware, async (req, res) => {
  const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
  if (!user) return res.status(404).json({ error: "User not found" });

  const isSubscriber = user.subscription?.stripeID && user.subscription?.status === "active" && (!user.subscription?.expires || user.subscription.expires > Math.floor(Date.now() / 1000));
  res.json({
    isSubscriber,
    subscription: {
      status: user.subscription?.status || null,
      expiresAt: user.subscription?.expires ? new Date(user.subscription.expires * 1000).toISOString() : null
    }
  });
});

// ==== STRIPE ROUTES ====
app.post("/create-checkout-session", authMiddleware, async (req, res) => {
  try {
    const { email, lookup_key } = req.body;
    if (!email || !lookup_key) return res.status(400).json({ error: "Missing email or lookup_key" });

    // Verify the email matches the authenticated user
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
    if (!user || user.email !== email) return res.status(403).json({ error: "Email mismatch" });

    const prices = await stripe.prices.list({ lookup_keys: [lookup_key], expand: ["data.product"] });
    
    if (!prices.data || prices.data.length === 0) {
      return res.status(400).json({ error: `No price found for lookup_key: ${lookup_key}` });
    }
    
    const origin = req.headers.origin || config.client;

    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: prices.data[0].id, quantity: 1 }],
      billing_address_collection: "auto",
      success_url: `${origin}/app/stripe?success=true`,
      cancel_url: `${origin}/app/stripe?canceled=true`,
      subscription_data: { metadata: { email } },
    });
    res.json({ url: session.url, id: session.id, customerID: session.customer });
  } catch (e) {
    console.error("Checkout session error:", e.message);
    res.status(500).json({ error: "Stripe session failed" });
  }
});

app.post("/create-portal-session", authMiddleware, async (req, res) => {
  try {
    const { customerID } = req.body;
    if (!customerID) return res.status(400).json({ error: "Missing customerID" });

    // Verify the customerID matches the authenticated user's subscription
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
    if (!user || (user.subscription?.stripeID && user.subscription.stripeID !== customerID)) {
      return res.status(403).json({ error: "Unauthorized customerID" });
    }

    const origin = req.headers.origin || config.client;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerID,
      return_url: `${origin}/app/stripe?portal=return`,
    });
    res.json({ url: portalSession.url, id: portalSession.id });
  } catch (e) {
    console.error("Portal session error:", e.message);
    res.status(500).json({ error: "Stripe portal failed" });
  }
});

// Enhanced error handling
app.use((err, req, res, next) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  logger.error('Unhandled error occurred', {
    message: err.message,
    stack: isDevelopment ? err.stack : undefined,
    path: req.path,
    method: req.method,
    requestId
  });
  
  res.status(500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
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

//'::' is very important you need it to listen on ipv6!
let server = app.listen(port, '::', () => {
  logger.info('Server started successfully', { 
    port, 
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
