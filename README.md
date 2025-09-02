<div align="center">
  <a href="#" />
    <img alt="Skateboard - Ship your React app in minutes" width="50%" src="https://github.com/user-attachments/assets/b7f2b098-503b-4439-8454-7eb45ae82307">
  </a>
  
  <h1 align="center">🛹 &nbsp;Skateboard</h1>
  
  <h3 align="center">
    <strong>a react starter with auth, stripe, shadcn, and sqlite</strong>
  </h3>
  
  <p align="center">
    <img src="public/icons/icon.png" width="60" height="60" alt="Skateboard Logo">
  </p>
  
  <p align="center">
    <a href="https://opensource.org/licenses/mit">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License">
    </a>
    <a href="https://github.com/stevederico/skateboard/stargazers">
      <img src="https://img.shields.io/github/stars/stevederico/skateboard?style=social" alt="GitHub stars">
    </a>
    <a href="https://www.npmjs.com/package/create-skateboard-app">
      <img src="https://img.shields.io/npm/v/create-skateboard-app?color=green" alt="npm version">
    </a>
  </p>

  <p align="center">
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-whats-included">Features</a> •
    <a href="#-demo">Demo</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-why-skateboard">Why Skateboard?</a>
  </p>
</div>

<br />

## 🚀 Quick Start

Get your app running in less than 60 seconds:

```bash
npx create-skateboard-app my-app
cd my-app
npm install
npm run start
```

That's it! Your full-stack app is now running at `http://localhost:5173` 🎉

<br />

## ✨ What's Included

Everything you need to ship a production-ready app:

### 🔐 **Authentication & User Management**
- **Sign up / Sign in** with JWT tokens
- **Protected routes** with automatic redirects
- **User context** management across your app
- **Session persistence** with secure cookies
- **App-specific auth isolation** (v0.2.6+)

### 💳 **Stripe Integration**
- **Checkout flows** ready to go
- **Subscription management** portal
- **Webhook handling** for payment events
- **Customer portal** integration

### 🎨 **Beautiful UI Components**
- **50+ Shadcn/ui components** pre-configured
- **Dark/Light mode** with system detection
- **Mobile-ready design** with responsive sidebar and TabBar
- **Landing page** that converts - fully customizable via constants.json
- **Settings page** with user management
- **Legal pages** (Terms, Privacy, EULA)

### 🛠️ **Developer Experience**
- **Hot Module Replacement** with Vite 7.1+
- **Zero config** - works out of the box
- **SQLite database** - no external dependencies
- **constants.json** - customize everything in one place
- **Modern JavaScript** - no TypeScript complexity

<br />

## 🎬 Demo

<div align="center">

  <img  width="100%"  alt="landing" src="https://github.com/user-attachments/assets/db1d9cb7-e398-4c87-a245-14371f37a38b" />

  
</div>

<br />

## 🏗️ Tech Stack

Built with the latest and greatest:

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | v19 | UI Framework |
| **Vite** | v7.1+ | Build Tool & Dev Server |
| **Tailwind CSS** | v4.1+ | Styling |
| **Shadcn/ui** | Latest | Component Library |
| **React Router** | v7.8+ | Routing |
| **Express** | v5 | Backend Server |
| **Multi-Database** | Latest | SQLite, PostgreSQL, MongoDB |
| **Stripe** | Latest | Payments |
| **JWT** | Latest | Authentication |

<br />

## 🤔 Why Skateboard?

### The Problem
Starting a new React project means:
- 🔧 Setting up authentication (2-3 days)
- 💰 Integrating payments (1-2 weeks)
- 🎨 Building UI components (2-4 weeks)
- 🗄️ Setting up a database (1 week)
- 🚢 Configuring deployment (1-2 days)

**Total: 1-2 months before you write your first feature**

### The Solution
Skateboard gives you all of this in **60 seconds**:

```bash
npx create-skateboard-app
```

Now you can focus on what makes your app unique, not boilerplate.

<br />

## 📁 Project Structure

```
skateboard/
├── src/
│   ├── components/       # Your custom components
│   ├── assets/          # Images, styles
│   ├── context.jsx      # Global state management
│   ├── main.jsx         # App entry point
│   └── constants.json   # All your app config
├── backend/
│   ├── server.js        # Express server
│   ├── database/        # Database providers (SQLite, PostgreSQL, MongoDB)
│   ├── databases/       # SQLite database files
│   └── config.json      # Backend config with database settings
├── package.json         # Dependencies
└── vite.config.js       # Vite configuration
```

<br />

## 🎯 Perfect For

- **🚀 Startups** - Launch your MVP in days, not months
- **🎨 Side Projects** - Stop rebuilding auth for every project
- **🏢 Agencies** - Deliver client projects faster
- **📚 Learning** - See how production apps are built
- **💡 Prototyping** - Test ideas quickly

<br />

## 🏆 Advanced Features

Beyond the basics, Skateboard includes enterprise-grade features often missed:

### 🏗️ **Multi-Tenancy Support**
- **Origin-based database switching** - One server, multiple apps
- **Perfect for agencies** managing multiple client projects
- **Automatic database isolation** per domain

### 🔒 **Enterprise Security**
- **Bcrypt with 14 salt rounds** - Industry-standard password hashing
- **JWT with proper expiration** - Secure token management
- **App-specific auth isolation** - No cross-contamination between projects
- **Origin validation** and CORS protection

### 🗃️ **Flexible Database Support**
- **Multiple database types** - SQLite (default), PostgreSQL, MongoDB
- **Unified database interface** - Same API across all database types
- **Custom query support** - Execute raw SQL or MongoDB operations
- **Zero external dependencies by default** - SQLite works out of the box
- **Deploy anywhere** - Works on any Node.js hosting

### ⚡ **Production Optimizations**
- **WAL mode SQLite** - Better concurrency and performance
- **Apache Common Log Format** - Professional monitoring ready
- **Graceful shutdown handling** - Container-friendly
- **Health check endpoints** - Load balancer compatible

### 📋 **Legal Compliance Ready**
- **Pre-written legal templates** - Terms, Privacy Policy, EULA
- **Dynamic placeholder replacement** - Company info auto-populated
- **Subscription legal notices** - App Store compliance included

### 🛠️ **Developer Experience++**
- **Auto-restart backend** with `--watch` flag
- **Environment auto-creation** from templates
- **Monorepo workspace architecture** 
- **Dynamic navigation** from config files
- **Stripe webhook verification** with customer matching

<br />

## 📖 Documentation

### Database Configuration

Configure your database in `backend/config.json`:

```json
[
  {
    "db": "MyApp",
    "origin": "http://localhost:5173",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
]
```

**Supported Database Types:**

**SQLite (Default):**
```json
{
  "dbType": "sqlite",
  "connectionString": "./databases/MyApp.db"
}
```

**PostgreSQL:**
```json
{
  "dbType": "postgresql", 
  "connectionString": "${POSTGRES_URL}"
}
```

**MongoDB:**
```json
{
  "dbType": "mongodb",
  "connectionString": "${MONGODB_URL}"
}
```

**Environment Variable Support:**

For production deployments, use environment variables instead of hardcoding connection strings:

```json
{
  "dbType": "mongodb",
  "connectionString": "${MONGODB_URL}"
}
```

**Standard Environment Variables:**
- `DATABASE_URL` - General database connection string
- `MONGODB_URL` - MongoDB connection string  
- `POSTGRES_URL` - PostgreSQL connection string

### Custom Database Queries

Execute raw database queries using the unified interface:

**SQLite/PostgreSQL:**
```javascript
import { databaseFactory } from './backend/database/factory.js';

const result = await databaseFactory.executeQuery('sqlite', 'MyApp', './databases/MyApp.db', {
  query: "SELECT * FROM users WHERE created_at > ?",
  params: [startDate]
});
```

**MongoDB:**
```javascript
const result = await databaseFactory.executeQuery('mongodb', 'MyApp', 'mongodb://localhost:27017', {
  collection: 'users',
  operation: 'find',
  query: { status: 'active' }
});

// Aggregation example
const aggResult = await databaseFactory.executeQuery('mongodb', 'MyApp', 'mongodb://localhost:27017', {
  collection: 'users',
  operation: 'aggregate', 
  pipeline: [
    { $match: { status: 'active' } },
    { $group: { _id: '$department', count: { $sum: 1 } } }
  ]
});
```

### App Configuration

All app configuration is in `src/constants.json`:

```json
{
  "appName": "Your App Name",
  "appIcon": "command",
  "tagline": "Your Tagline",
  "cta": "Get Started",
  "features": {
    "title": "Everything You Need",
    "items": [
      {
        "icon": "🔐",
        "title": "Authentication", 
        "description": "Complete user management with JWT tokens and secure sessions"
      },
      {
        "icon": "💳",
        "title": "Stripe Payments",
        "description": "Ready-to-use checkout flows and subscription management"
      },
      {
        "icon": "🎨",
        "title": "Beautiful UI",
        "description": "50+ Shadcn components with dark mode support"
      }
    ]
  },
  "backendURL": "http://localhost:8000",
  "stripeProducts": [{
    "price": "$9.99",
    "title": "Pro Plan",
    "interval": "monthly", 
    "lookup_key": "pro_monthly"
  }]
}
```

### Landing Page Customization

Your entire landing page is configured through `constants.json` - no code changes needed:

- **App name & tagline** - Update branding instantly
- **CTA button text** - Customize your call-to-action
- **Features section** - Add/remove features with custom icons, titles, and descriptions
- **All content** - Everything displays automatically from your config

### Environment Setup

1. **Stripe Setup** (Optional)
   ```bash
   # Add to backend/.env
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

2. **JWT Secret**
   ```bash
   # Add to backend/.env
   JWT_SECRET=your-secret-key
   ```

3. **Database Connection (Production)**
   ```bash
   # Add to backend/.env for remote databases
   MONGODB_URL=mongodb+srv://username:password@cluster.mongodb.net/myapp
   POSTGRES_URL=postgresql://username:password@hostname:5432/myapp
   DATABASE_URL=your-database-connection-string
   ```

### Deployment

Deploy to any platform that supports Node.js:

- **Vercel** - Zero config deployment
- **Netlify** - Great for static sites
- **Railway** - Full stack hosting
- **Render** - Free tier available
- **AWS/GCP/Azure** - For scale

<br />

## 🗺️ Roadmap

Check out what's coming next in our [CHANGELOG](https://github.com/stevederico/skateboard/blob/master/changelog.md)

**Coming Soon:**
- 📱 iOS/Android app wrapper
- 💬 Real-time chat component
- 📊 Analytics dashboard
- 🔍 Full-text search
- 🌍 i18n support
- 🎯 A/B testing tools

<br />

## 🤝 Contributing

We love contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/skateboard
cd skateboard
npm install
npm run start
```

<br />

## 📬 Community & Support

- **🐦 X**: [@stevederico](https://x.com/stevederico)
- **🐛 Issues**: [GitHub Issues](https://github.com/stevederico/skateboard/issues)

<br />

## 🙏 Acknowledgements

Built on the shoulders of giants:

- [React](https://react.dev) - The library that powers the web
- [Vite](https://vitejs.dev) - Lightning fast build tool
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS
- [Shadcn/ui](https://ui.shadcn.com) - Beautiful components
- [Stripe](https://stripe.com) - Payment infrastructure

<br />

## 🎪 Related Projects

- [skateboard-ui](https://github.com/stevederico/skateboard-ui) - Component library
- [skateboard-blog](https://github.com/stevederico/skateboard-blog) - Blog template
- [create-skateboard-app](https://github.com/stevederico/create-skateboard-app) - CLI tool

<br />

## 🛠️ Manual Setup

If you're working with an existing Skateboard project:

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure App Styling**
   Set your app color in `src/styles.css`

3. **Update Backend URLs**
   In `src/constants.json`:
   ```json
   {
     "backendURL": "http://your-backend-url",
     "devBackendURL": "http://localhost:8000"
   }
   ```

4. **Update Package Info**
   Change package name and version in `package.json`

5. **Initialize Git**
   ```bash
   git init
   ```

<br />

## 📄 License

MIT License - use it however you want! See [LICENSE](LICENSE) for details.

<br />

---

<div align="center">
  <p>
    <strong>Ready to ship?</strong>
  </p>
  
  ```bash
  npx create-skateboard-app
  ```
  
  <p>
    Built with ❤️ by <a href="https://github.com/stevederico">Steve Derico</a> and contributors
  </p>
  
  <p>
    <a href="https://github.com/stevederico/skateboard">⭐ Star us on GitHub</a> — it helps!
  </p>
</div>
