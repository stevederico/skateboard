import express from 'express';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as fs from 'node:fs';
import crypto from 'node:crypto';

// For Deno compatibility
const isRunningInDeno = typeof Deno !== 'undefined';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CORS configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// In-memory user store (replace with DB in production)
const users = [];
let lastUserId = 0;

// JWT helper
async function generateToken(userId) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  
  // Basic JWT implementation
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ userId, exp: Date.now() + 3600000 }));
  const dataToSign = `${header}.${payload}`;
  
  const signature = await crypto.subtle.sign(
    { name: "HMAC" },
    key,
    new TextEncoder().encode(dataToSign)
  );
  
  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${dataToSign}.${base64Signature}`;
}

// Password hashing (simplified - use bcrypt in production)
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + "salt");
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createServer() {
  const app = express();
  
  // Create Vite server in middleware mode
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom'
  });
  
  // Use vite's connect instance as middleware
  app.use(vite.middlewares);
  
  // Parse JSON request bodies
  app.use(express.json());
  
  // Serve static files from /public and /dist/client
  app.use(express.static(resolve(__dirname, 'public')));
  app.use(express.static(resolve(__dirname, 'dist/client')));
  
  // Add CORS middleware
  app.use((req, res, next) => {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });
  
  // Auth API routes
  app.post('/signup', async (req, res) => {
    try {
      const { email, password, name } = req.body;
      const trimmedEmail = email?.trim();
      const trimmedName = name?.trim();
      
      if (!trimmedEmail || !password?.trim() || !trimmedName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if email is valid
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Check if user already exists
      const existingUser = users.find(u => u.email === trimmedEmail);
      if (existingUser) {
        return res.status(409).json({ error: "Email already exists" });
      }
      
      // Hash password
      const hashedPassword = await hashPassword(password);
      
      // Create new user
      const userId = ++lastUserId;
      const newUser = {
        id: userId,
        email: trimmedEmail,
        password: hashedPassword,
        name: trimmedName
      };
      
      users.push(newUser);
      
      // Generate token
      const token = await generateToken(userId);
      
      // Return user info without password
      const { password: _, ...userWithoutPassword } = newUser;
      return res.status(201).json({ 
        ...userWithoutPassword,
        token
      });
    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post('/signin', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      // Find user
      const user = users.find(u => u.email === email.trim());
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Verify password
      const hashedPassword = await hashPassword(password);
      if (user.password !== hashedPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Generate token
      const token = await generateToken(user.id);
      
      // Return user info without password
      const { password: _, ...userWithoutPassword } = user;
      return res.status(200).json({ 
        ...userWithoutPassword,
        token
      });
    } catch (err) {
      console.error('Signin error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get('/users', async (req, res) => {
    try {
      // This should be a protected route requiring authentication
      // For simplicity, we're skipping the auth check here
      
      // Return list of users without passwords
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      return res.json(usersWithoutPasswords);
    } catch (err) {
      console.error('Get users error:', err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // SSR route - must be last to avoid conflicts with API routes
  app.use('*', async (req, res) => {
    const url = req.originalUrl;
    
    try {
      // 1. Read index.html
      let template = fs.readFileSync(resolve(__dirname, 'index.html'), 'utf-8');
      
      // 2. Apply Vite HTML transforms (this injects the Vite HMR client)
      template = await vite.transformIndexHtml(url, template);
      
      // 3. Load the server entry
      let render;
      try {
        const serverEntry = await vite.ssrLoadModule('/src/entry-server.jsx');
        render = serverEntry.render;
      } catch (e) {
        console.error('Failed to load SSR module:', e);
        // Fallback to sending the template without SSR
        return res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      }
      
      // 4. Render the app HTML
      let html = '';
      let initialState = {};
      
      try {
        const result = await render(url);
        html = result.html;
        initialState = result.initialState;
      } catch (e) {
        console.error('Render error:', e);
        // Continue with empty HTML so client-side can take over
      }
      
      // 5. Inject the app-rendered HTML into the template
      const serializedState = JSON.stringify(initialState)
        .replace(/</g, '\\u003c')  // Escape HTML tags
        .replace(/>/g, '\\u003e');
      
      const responseHtml = template
        .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
        .replace('<!--initial-state-->', `<script>window.__INITIAL_STATE__ = ${serializedState}</script>`);
      
      // 6. Send the rendered HTML back
      res.status(200).set({ 'Content-Type': 'text/html' }).end(responseHtml);
    } catch (e) {
      // If an error is caught, let Vite fix the stack trace
      vite.ssrFixStacktrace(e);
      console.error('SSR Error:', e);
      
      // In development, return the error page
      res.status(500).end(`<pre>${e.stack}</pre>`);
    }
  });
  
  // Start the server on port 3001
  app.listen(3001, () => {
    console.log('Server is running at http://localhost:3001');
    console.log('Auth endpoints:');
    console.log('  - POST /signup');
    console.log('  - POST /signin');
    console.log('  - GET /users');
  });
}

createServer(); 