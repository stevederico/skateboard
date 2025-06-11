// ==== IMPORTS ====
import express from "npm:express";
import { MongoClient } from "npm:mongodb";
import Stripe from "npm:stripe";
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

import { dirname, resolve, fromFileUrl } from "https://deno.land/std@0.210.0/path/mod.ts";
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";

// ==== CONFIG & ENV ====
let config;
try {
  const configPath = resolve(dirname(fromFileUrl(import.meta.url)), './config.json');
  const configData = await Deno.readFile(configPath);
  config = JSON.parse(new TextDecoder().decode(configData));
  config = JSON.parse(new TextDecoder().decode(configData));
} catch (err) {
  console.error('Failed to load config:', err);
  config = [{ db: "SkateboardApp", origin: "http://localhost:5173" }];
}

// Environment setup
if (!isProd()) {
  loadLocalENV();
} else {
  cron("0 * * * *", async () => {
    console.log(`Hourly Completed at ${new Date().toLocaleTimeString()}`);
  });
}

const MONGO_URI = Deno.env.get("MONGO_URI");
const STRIPE_KEY = Deno.env.get("STRIPE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");

if (!MONGO_URI || !STRIPE_KEY || !JWT_SECRET) {
  console.error("Missing required environment variables");
  Deno.exit(1);
}

// ==== SERVICES SETUP ====
// Stripe setup
const stripe = new Stripe(STRIPE_KEY);

// MongoDB setup
const mongoUri = MONGO_URI.trim();
if (!mongoUri) {
  console.error("MongoDB URI is empty or undefined");
  Deno.exit(1);
}
if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
  console.error("Invalid MongoDB URI scheme. URI must start with mongodb:// or mongodb+srv://");
  Deno.exit(1);
}

const client = new MongoClient(mongoUri);
try {
  await client.connect();
} catch (e) {
  console.error("MongoDB connection failed:", e.message);
  Deno.exit(1);
}

// ==== DATABASE HELPERS ====
// Get database name based on origin
const getDBName = (origin) => {
  const configEntry = config.find(entry => entry.origin === origin) || config[0];
  const dbName = configEntry.db;
  console.log(`Using database: ${dbName} for origin: ${origin}`);
  return dbName;
};

// Initialize db and collections
let db;
let users;
let auths;

// Create indexes on first startup if they don't exist
const initialDb = client.db(config[0].db);
const usersCollection = initialDb.collection("Users");
const authsCollection = initialDb.collection("Auths");

// Check and create indexes if they don't exist
async function ensureIndexes() {
  const userIndexes = await usersCollection.listIndexes().toArray();
  const authIndexes = await authsCollection.listIndexes().toArray();

  if (!userIndexes.some(index => index.key.email === 1)) {
    await usersCollection.createIndex({ email: 1 }, { unique: true, name: "users_email_index" });
  }

  if (!authIndexes.some(index => index.key.email === 1)) {
    await authsCollection.createIndex({ email: 1 }, { unique: true, name: "auths_email_index" });
  }
}

try {
  await ensureIndexes();
} catch (err) {
  console.error('Error ensuring indexes:', err);
}

// ==== EXPRESS SETUP ====
const app = express();
const allowedOrigins = config.map(entry => entry.origin);

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("Webhook received");

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    // req.body is a Buffer here, as required by Stripe
    event = await stripe.webhooks.constructEventAsync(req.body, signature, Deno.env.get("STRIPE_ENDPOINT_SECRET"));
    console.log("Webhook event:", event);
  } catch (e) {
    console.error("Webhook signature verification failed:", e.message);
    return res.status(400).send();
  }

  let myDB = client.db("MyApp");
  let users = myDB.collection("Users");
  const { customer: stripeID, current_period_end, status } = event.data.object;
  const customer = await stripe.customers.retrieve(stripeID);
  const customerEmail = customer.email.toLowerCase();
  if (["customer.subscription.deleted", "customer.subscription.updated","customer.subscription.created"].includes(event.type)) {
    console.log(`Webhook: ${event.type} for ${customerEmail}`);
    const user = await users.findOne({ email: customerEmail });
    if (user) {
      await users.updateOne({ email: customerEmail }, { $set: { subscription: { stripeID, expires: current_period_end, status } } });
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
  if (!db || db.databaseName !== getDBName(origin)) {
    db = client.db(getDBName(origin));
    users = db.collection("Users");
    auths = db.collection("Auths");
  }
  next();
});

app.use(express.json());

const tokenExpirationDays = 7;

// ==== JWT HELPERS ====
function tokenExpireTimestamp(){
  return Math.floor(Date.now() / 1000) + tokenExpirationDays * 24 * 60 * 60; // 1 week from now
}

// Remove the encoder and importKey since we'll use JWT_SECRET directly with djwt
async function generateToken(userID, origin) {
  try {
    const exp = tokenExpireTimestamp(); 
    const dbName = "A";
    const header = { alg: "HS256", typ: "JWT" };
    const payload = { userID, exp, dbName };

    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET not set");

    const keyData = new TextEncoder().encode(jwtSecret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    return await create(header, payload, cryptoKey);
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
    const keyData = new TextEncoder().encode(JWT_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const payload = await verify(token, cryptoKey, { algorithms: ["HS256"] });

    req.userID = payload.userID;
    req.dbName = payload.dbName;

    if (!db || db.databaseName !== payload.dbName) {
      db = client.db(payload.dbName);
      users = db.collection("Users");
      auths = db.collection("Auths");
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
    const file = await Deno.readFile("./public/index.html");
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
    db = client.db(dbName);
    users = db.collection("Users");
    auths = db.collection("Auths");

    var { email, password, name } = req.body;
    email = email?.toLowerCase().trim()
    if (!email || !password?.trim() || !name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const hash = await bcrypt.hash(password, await bcrypt.genSalt(12));
    let insertID = generateUUID()
    const result = await users.insertOne({
      _id: insertID,
      email: email,
      name: name.trim(),
      created_at: Date.now()
    });

    const token = await generateToken(insertID, req.headers.origin);
    await auths.insertOne({ email: email, password: hash, userID: insertID });
    res.status(201).json({ id: insertID.toString(), email: email, name: name.trim(), 
      token: token,
      tokenExpires: tokenExpireTimestamp() 
       
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "Email exists" });
    console.error("Signup error:", e.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/signin", async (req, res) => {
  try {
    const origin = req.headers.origin;
    const dbName = getDBName(origin);

    db = client.db(dbName);
    users = db.collection("Users");
    auths = db.collection("Auths");

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
    const auth = await auths.findOne({ email: email });
    if (!auth) {
      console.log(`[${new Date().toISOString()}] Auth record not found for:`, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    //verify
    if (!(await bcrypt.compare(password, auth.password))) {
      console.log(`[${new Date().toISOString()}] Password verification failed for:`, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // get user
    const user = await users.findOne({ email: email });
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
  const user = await users.findOne({ _id: req.userID });
  console.log("/me checking for user with ID:", req.userID);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
});

app.put("/me", authMiddleware, async (req, res) => {
  try {
    // Find user first to verify existence
    const user = await users.findOne({ _id: req.userID });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Remove fields that shouldn't be updateable
    const update = { ...req.body };
    delete update._id;
    delete update.email;
    delete update.created_at;
    delete update.subscription;

    // Update user document
    const result = await users.updateOne(
      { _id: req.userID },
      { $set: update }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ error: "No changes made" });
    }

    // Return updated user
    const updatedUser = await users.findOne({ _id: req.userID });
    return res.json(updatedUser);
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ error: "Failed to update user" });
  }
});

app.get("/isSubscriber", authMiddleware, async (req, res) => {
  const user = await users.findOne(
    { _id: req.userID },
    { projection: { "subscription.stripeID": 1, "subscription.expires": 1, "subscription.status": 1 } }
  );
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
    const user = await users.findOne({ _id: req.userID });
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
    const user = await users.findOne({ _id: req.userID });
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
  if (typeof Deno.env.get("ENV") === "undefined") {
    return false
  } else if (Deno.env.get("ENV") === "production") {
    return true
  } else {
    return false
  }
}

function loadLocalENV() {
  const __dirname = dirname(fromFileUrl(import.meta.url));
  const envFilePath = resolve(__dirname, './.env');
  const envExamplePath = resolve(__dirname, './.env.example');
  
  // Check if .env exists, if not create it from .env.example
  try {
    Deno.statSync(envFilePath);
  } catch (err) {
    // .env doesn't exist, try to create it from .env.example
    try {
      const exampleData = Deno.readTextFileSync(envExamplePath);
      Deno.writeTextFileSync(envFilePath, exampleData);
    } catch (exampleErr) {
      console.error('Failed to create .env from template:', exampleErr);
      return;
    }
  }

  try {
    const data = Deno.readTextFileSync(envFilePath);
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
        Deno.env.set(key, value);
      }
    }
  } catch (err) {
    console.error('Failed to load .env file:', err);
  }
}

// ==== SERVER STARTUP ====
const port = parseInt(Deno.env.get("PORT") || "8000");

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
Deno.addSignalListener("SIGINT", async () => {
  console.log("Shutting down...");
  await client.close();
  Deno.exit();
});
