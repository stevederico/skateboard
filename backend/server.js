// ==== IMPORTS ====
import express from "express";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { DatabaseSync as Database } from "node:sqlite";
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, stat, readFileSync, writeFileSync, statSync } from 'node:fs';
import { promisify } from 'node:util';

// ==== CONFIG & ENV ====
let config;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configPath = resolve(__dirname, './config.json');
  const configData = await promisify(readFile)(configPath);
  config = JSON.parse(configData.toString());
} catch (err) {
  console.error('Failed to load config:', err);
  config = [{ db: "MyApp", origin: "http://localhost:5173" }];
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

if (!STRIPE_KEY || !JWT_SECRET) {
  console.error("Missing required environment variables: STRIPE_KEY and JWT_SECRET are required");
  process.exit(1);
}

console.log('Using database: SQLite');

// ==== DATABASE ABSTRACTION LAYER ====
class DatabaseAdapter {
  constructor() {
    this.databases = new Map();
  }

  async initialize() {
    await this.initializeSQLite();
  }

  async initializeSQLite() {
    // Create databases directory if it doesn't exist
    try {
      await promisify(mkdir)('./databases', { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error("Failed to create databases directory:", err);
      }
    }
  }

  async ensureSQLiteSchema(db) {
    // Create Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS Users (
        _id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        subscription_stripeID TEXT,
        subscription_expires INTEGER,
        subscription_status TEXT
      )
    `);

    // Create Auths table
    db.exec(`
      CREATE TABLE IF NOT EXISTS Auths (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        userID TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES Users(_id)
      )
    `);

    // Create indexes
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON Users(email)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_auths_email ON Auths(email)`);
  }

  getDatabase(dbName) {
    if (!this.databases.has(dbName)) {
      const dbPath = `./databases/${dbName}.db`;
      const db = new Database(dbPath);
      this.ensureSQLiteSchema(db);
      this.databases.set(dbName, db);
    }
    return this.databases.get(dbName);
  }

  async findUser(db, query, projection = {}) {
    const { _id, email } = query;
    let sql = "SELECT * FROM Users WHERE ";
    let params = [];
    
    if (_id) {
      sql += "_id = ?";
      params.push(_id);
    } else if (email) {
      sql += "email = ?";
      params.push(email);
    } else {
      return null;
    }

    const result = db.prepare(sql).get(...params);
    if (result && result.subscription_stripeID) {
      result.subscription = {
        stripeID: result.subscription_stripeID,
        expires: result.subscription_expires,
        status: result.subscription_status
      };
      delete result.subscription_stripeID;
      delete result.subscription_expires;
      delete result.subscription_status;
    }
    return result;
  }

  async insertUser(db, userData) {
    const { _id, email, name, created_at } = userData;
    const sql = "INSERT INTO Users (_id, email, name, created_at) VALUES (?, ?, ?, ?)";
    db.prepare(sql).run(_id, email, name, created_at);
    return { insertedId: _id };
  }

  async updateUser(db, query, update) {
    const { _id } = query;
    const updateData = update.$set;
    
    if (updateData.subscription) {
      const { stripeID, expires, status } = updateData.subscription;
      const sql = `UPDATE Users SET 
        subscription_stripeID = ?, 
        subscription_expires = ?, 
        subscription_status = ? 
        WHERE _id = ?`;
      const result = db.prepare(sql).run(stripeID, expires, status, _id);
      return { modifiedCount: result.changes };
    } else {
      // Handle other updates
      const fields = Object.keys(updateData);
      if (fields.length === 0) return { modifiedCount: 0 };
      
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => updateData[field]);
      values.push(_id);
      
      const sql = `UPDATE Users SET ${setClause} WHERE _id = ?`;
      const result = db.prepare(sql).run(...values);
      return { modifiedCount: result.changes };
    }
  }

  async findAuth(db, query) {
    const { email } = query;
    const sql = "SELECT * FROM Auths WHERE email = ?";
    return db.prepare(sql).get(email);
  }

  async insertAuth(db, authData) {
    const { email, password, userID } = authData;
    const sql = "INSERT INTO Auths (email, password, userID) VALUES (?, ?, ?)";
    db.prepare(sql).run(email, password, userID);
    return { insertedId: email };
  }
}

// Initialize database adapter
const dbAdapter = new DatabaseAdapter();
await dbAdapter.initialize();

// ==== SERVICES SETUP ====
// Stripe setup
const stripe = new Stripe(STRIPE_KEY);

// ==== DATABASE HELPERS ====
// Get database name based on origin
const getDBName = (origin) => {
  const configEntry = config.find(entry => entry.origin === origin) || config[0];
  const dbName = configEntry.db;
  console.log(`Using database: ${dbName} for origin: ${origin}`);
  return dbName;
};

// Initialize db
let db;

// ==== EXPRESS SETUP ====
const app = express();
const allowedOrigins = config.map(entry => entry.origin);

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

  const webhookDb = dbAdapter.getDatabase("MyApp");
  const { customer: stripeID, current_period_end, status } = event.data.object;
  const customer = await stripe.customers.retrieve(stripeID);
  const customerEmail = customer.email.toLowerCase();
  
  if (["customer.subscription.deleted", "customer.subscription.updated","customer.subscription.created"].includes(event.type)) {
    console.log(`Webhook: ${event.type} for ${customerEmail}`);
    const user = await dbAdapter.findUser(webhookDb, { email: customerEmail });
    if (user) {
      await dbAdapter.updateUser(webhookDb, { email: customerEmail }, { 
        $set: { subscription: { stripeID, expires: current_period_end, status } } 
      });
    } else {
      console.warn(`Webhook: No user found for email ${customerEmail}`);
    }
  }
  res.status(200).send();
});

// Enhanced logging middleware
app.use((req, res, next) => {
  // Log incoming request details
  console.log(`[${new Date().toISOString()}] Request:`, {
    method: req.method,
    path: req.originalUrl,
    origin: req.headers.origin || 'none',
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'present' : 'none'
    }
  });

  res.on('finish', () => {
    // Enhanced response logging
    console.log(`[${new Date().toISOString()}] Response:`, {
      statusCode: res.statusCode,
      method: req.method,
      path: req.originalUrl,
      headers: res.getHeaders()
    });

    // Additional status-specific logging
    if (res.statusCode === 503) {
      console.error(`[503] ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
    } else {
      console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl}`);
    }
  });

  next();
});

// CORS middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] CORS:`, {
    origin: req.headers.origin || 'none',
    method: req.method
  });

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    console.log(`[${new Date().toISOString()}] Handling preflight request`);
    return res.status(204).end();
  }
  next();
});

// Database switching middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const dbName = getDBName(origin);
  
  if (!db || db !== dbAdapter.getDatabase(dbName)) {
    db = dbAdapter.getDatabase(dbName);
  }
  next();
});

app.use(express.json());

const tokenExpirationDays = 7;

// ==== BCRYPT HELPERS ====
async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12);
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
    const dbName = getDBName(origin);
    const payload = { userID, exp, dbName };

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
    req.dbName = payload.dbName;

    // Update database connection if needed
    const targetDbName = payload.dbName;
    if (!db || db !== dbAdapter.getDatabase(targetDbName)) {
      db = dbAdapter.getDatabase(targetDbName);
    }

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
  return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => Math.random().toString(16)[2] || '0');
}

// ==== AUTH ROUTES ====
app.post("/signup", async (req, res) => {
  try {
    const origin = req.headers.origin;
    const dbName = getDBName(origin);
    db = dbAdapter.getDatabase(dbName);

    var { email, password, name } = req.body;
    email = email?.toLowerCase().trim()
    if (!email || !password?.trim() || !name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const hash = await hashPassword(password);
    let insertID = generateUUID()
    
    try {
      const result = await dbAdapter.insertUser(db, {
        _id: insertID,
        email: email,
        name: name.trim(),
        created_at: Date.now()
      });

      const token = await generateToken(insertID, req.headers.origin);
      await dbAdapter.insertAuth(db, { email: email, password: hash, userID: insertID });
      
      res.status(201).json({ 
        id: insertID.toString(), 
        email: email, 
        name: name.trim(), 
        token: token,
        tokenExpires: tokenExpireTimestamp() 
      });
    } catch (e) {
      if (e.message?.includes('UNIQUE constraint failed')) {
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
    const dbName = getDBName(origin);
    db = dbAdapter.getDatabase(dbName);

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
    const auth = await dbAdapter.findAuth(db, { email: email });
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
    const user = await dbAdapter.findUser(db, { email: email });
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
  const user = await dbAdapter.findUser(db, { _id: req.userID });
  console.log("/me checking for user with ID:", req.userID);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
});

app.put("/me", authMiddleware, async (req, res) => {
  try {
    // Find user first to verify existence
    const user = await dbAdapter.findUser(db, { _id: req.userID });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Remove fields that shouldn't be updateable
    const update = { ...req.body };
    delete update._id;
    delete update.email;
    delete update.created_at;
    delete update.subscription;

    // Update user document
    const result = await dbAdapter.updateUser(db, { _id: req.userID }, { $set: update });

    if (result.modifiedCount === 0) {
      return res.status(500).json({ error: "No changes made" });
    }

    // Return updated user
    const updatedUser = await dbAdapter.findUser(db, { _id: req.userID });
    return res.json(updatedUser);
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/isSubscriber", authMiddleware, async (req, res) => {
  const user = await dbAdapter.findUser(db, { _id: req.userID });
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
    const user = await dbAdapter.findUser(db, { _id: req.userID });
    if (!user || user.email !== email) return res.status(403).json({ error: "Email mismatch" });

    const prices = await stripe.prices.list({ lookup_keys: [lookup_key], expand: ["data.product"] });
    const origin = req.headers.origin || config[0].origin;

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
    const user = await dbAdapter.findUser(db, { _id: req.userID });
    if (!user || (user.subscription?.stripeID && user.subscription.stripeID !== customerID)) {
      return res.status(403).json({ error: "Unauthorized customerID" });
    }

    const origin = req.headers.origin || config[0].origin;
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
  
  // Close all SQLite connections
  for (const [dbName, db] of dbAdapter.databases) {
    db.close();
  }
  
  process.exit();
});
