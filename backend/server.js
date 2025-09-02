// ==== IMPORTS ====
import express from "express";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { databaseManager } from "./adapters/manager.js";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, stat, readFileSync, writeFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';

// ==== CONFIG & ENV ====
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
    clients: rawConfig.clients,
    databases: rawConfig.databases.map(entry => ({
      ...entry,
      connectionString: resolveEnvironmentVariables(entry.connectionString)
    }))
  };
} catch (err) {
  console.error('Failed to load config:', err);
  config = {
    clients: ["http://localhost:5173"],
    databases: [{ 
      db: "MyApp", 
      origin: "http://localhost:5173",
      dbType: "sqlite",
      connectionString: "./databases/MyApp.db"
    }]
  }; 
}

// Environment setup
if (!isProd()) {
  loadLocalENV();
} else {
  setInterval(async () => {
    console.log(`Hourly Completed at ${new Date().toLocaleTimeString()}`);
  }, 60 * 60 * 1000); // Every hour
}

const STRIPE_KEY = process.env.STRIPE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// Validate required environment variables
function validateEnvironmentVariables() {
  const missing = [];
  
  if (!STRIPE_KEY) missing.push('STRIPE_KEY');
  if (!JWT_SECRET) missing.push('JWT_SECRET');
  
  // Check for database environment variables that are referenced but not defined
  const referencedEnvVars = new Set();
  config.databases.forEach(entry => {
    if (typeof entry.connectionString === 'string') {
      const matches = entry.connectionString.match(/\$\{([^}]+)\}/g);
      if (matches) {
        matches.forEach(match => {
          const varName = match.slice(2, -1); // Remove ${ and }
          referencedEnvVars.add(varName);
          if (!process.env[varName]) {
            missing.push(`${varName} (referenced in database config for ${entry.origin})`);
          }
        });
      }
    }
  });
  
  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach(varName => console.error(`  - ${varName}`));
    console.error("\nCommon database environment variables:");
    console.error("  - DATABASE_URL (general database connection)");
    console.error("  - MONGODB_URL (MongoDB connection)");
    console.error("  - POSTGRES_URL (PostgreSQL connection)");
    process.exit(1);
  }
}

validateEnvironmentVariables();

console.log('Multi-database support enabled');

// ==== DATABASE HELPERS ====
// Get database configuration based on origin
const getDBConfig = (origin) => {
  const configEntry = config.databases.find(entry => entry.origin === origin) || config.databases[0];
  console.log(`Using database: ${configEntry.db} (${configEntry.dbType}) for origin: ${origin}`);
  return configEntry;
};

// ==== SERVICES SETUP ====
// Stripe setup
const stripe = new Stripe(STRIPE_KEY);

// Current database config cache
let currentDbConfig = null;

// ==== EXPRESS SETUP ====
const app = express();
const allowedOrigins = config.clients;

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

  // Use default config for webhooks (first config entry)
  const webhookConfig = config.databases[0];
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
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// Database config middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  currentDbConfig = getDBConfig(origin);
  next();
});

app.use(express.json());

const tokenExpirationDays = 7;

// ==== BCRYPT HELPERS ====
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(14);
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
async function generateToken(userID, origin) {
  try {
    const exp = tokenExpireTimestamp(); 
    const dbConfig = getDBConfig(origin);
    const payload = { userID, exp, dbConfig: { db: dbConfig.db, dbType: dbConfig.dbType, connectionString: dbConfig.connectionString } };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET not set");

    // Use jsonwebtoken with exact same config as djwt
    return jwt.sign(payload, jwtSecret, { 
      algorithm: 'HS256',
      header: { alg: "HS256", typ: "JWT" }
    });
  } catch (error) {
    console.error("Token generation error:", error);
    throw error;
  }
}

async function authMiddleware(req, res, next) {

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.split(" ")[1];
    
    // Use jsonwebtoken with exact same config as djwt
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    req.userID = payload.userID;
    req.dbConfig = payload.dbConfig;

    // Override current db config with token's db config
    currentDbConfig = payload.dbConfig;

    next();
  } catch (error) {
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

// ==== AUTH ROUTES ====
app.post("/signup", async (req, res) => {
  try {
    const origin = req.headers.origin;
    const dbConfig = getDBConfig(origin);

    var { email, password, name } = req.body;
    email = email?.toLowerCase().trim()
    if (!email || !password?.trim() || !name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const hash = await hashPassword(password);
    let insertID = generateUUID()
    
    try {
      const result = await databaseManager.insertUser(dbConfig.dbType, dbConfig.db, dbConfig.connectionString, {
        _id: insertID,
        email: email,
        name: name.trim(),
        created_at: Date.now()
      });

      const token = await generateToken(insertID, req.headers.origin);
      await databaseManager.insertAuth(dbConfig.dbType, dbConfig.db, dbConfig.connectionString, { email: email, password: hash, userID: insertID });
      
      res.status(201).json({ 
        id: insertID.toString(), 
        email: email, 
        name: name.trim(), 
        token: token,
        tokenExpires: tokenExpireTimestamp() 
      });
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed') || e.message?.includes('duplicate key') || e.code === 11000) {
        return res.status(409).json({ error: "Email exists" });
      }
      throw e;
    }
  } catch (e) {
    console.error("Signup error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/signin", async (req, res) => {
  try {
    const origin = req.headers.origin;
    const dbConfig = getDBConfig(origin);

    if (!req.headers["content-type"]?.includes("application/json")) {
      console.log(`[${new Date().toISOString()}] Invalid content type:`, req.headers["content-type"]);
      return res.status(400).json({ error: "Invalid content type" });
    }

    var { email, password } = req.body;
    if (!email || !password) {
      console.log(`[${new Date().toISOString()}] Missing credentials`);
      return res.status(400).json({ error: "Missing credentials" });
    }

    email = email.toLowerCase().trim();
    console.log(`[${new Date().toISOString()}] Attempting signin for email:`, email);

    // Check if auth exists
    const auth = await databaseManager.findAuth(dbConfig.dbType, dbConfig.db, dbConfig.connectionString, { email: email });
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
    const user = await databaseManager.findUser(dbConfig.dbType, dbConfig.db, dbConfig.connectionString, { email: email });
    if (!user) {
      console.error("User not found for auth record:", auth);
      return res.status(404).json({ error: "User not found" });
    }

    // generate token
    const token = await generateToken(user._id.toString(), origin);

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
      token: token,
      tokenExpires: tokenExpireTimestamp()
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

app.put("/me", authMiddleware, async (req, res) => {
  try {
    // Find user first to verify existence
    const user = await databaseManager.findUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Remove fields that shouldn't be updateable
    const update = { ...req.body };
    delete update._id;
    delete update.email;
    delete update.created_at;
    delete update.subscription;

    // Update user document
    const result = await databaseManager.updateUser(currentDbConfig.dbType, currentDbConfig.db, currentDbConfig.connectionString, { _id: req.userID }, { $set: update });

    if (result.modifiedCount === 0) {
      return res.status(500).json({ error: "No changes made" });
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
    const origin = req.headers.origin || config.databases[0].origin;

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

    const origin = req.headers.origin || config.databases[0].origin;
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
  console.log(`🚀 Server is running on http://localhost:${port}`);
});

// Handle graceful shutdown on SIGTERM NEED THIS FOR PROXY, it will not work without it
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  // Optional: Handle SIGINT for Ctrl+C NEED THIS FOR PROXY, it will not work without it
  process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Handle shutdown gracefully
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  
  // Close all database connections
  await databaseManager.closeAll();
  
  process.exit();
});
