<div align="center">
  <a href="#" />
    <img alt="Skateboard - Ship your React app in minutes" width="40%" src="https://github.com/user-attachments/assets/b7f2b098-503b-4439-8454-7eb45ae82307">
  </a>
  </div>

  <p align="center" style="margin-top: 40px; margin-bottom: 5px;">
    <img src="public/icons/icon.png" width="60" height="60" alt="Skateboard Logo">
  </p>
  <h1 align="center" style="border-bottom: none; margin-bottom: 0;">Skateboard</h1>
  <h3 align="center" style="margin-top: 0; font-weight: normal;">
    a react starter with auth, stripe, shadcn, and sqlite
  </h3>
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

## 🎬 Demo

<div align="center">
  <img width="75%" alt="skateboard dark mode demo" src="public/skateboard-dark.png" />
</div>

  <br />
 

</div>

<br />

## 🚀 Quick Start

```bash
npx create-skateboard-app
```

That's it, your app is now running at `http://localhost:5173` 🎉

<br />

## ✨ What's Included

Everything you need to ship a production-ready app:

### 🏗️ **Application Shell Architecture (v1.0)**
- **95% less boilerplate** - Focus on features, not infrastructure
- **Shell + Content + Config** - Framework provides structure, you provide content
- **Update once, fix everywhere** - All apps inherit improvements from skateboard-ui
- **16-line main.jsx** - Just define your routes
- **Convention over configuration** - Sensible defaults with escape hatches everywhere

### 🔐 **Authentication & User Management**
- **Sign up / Sign in** with JWT tokens
- **Protected routes** with automatic redirects
- **User context** management across your app
- **Session persistence** with secure cookies
- **App-specific auth isolation**
- **Usage tracking** with configurable limits for free users

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
- **Zero config** - just works out of the box
- **Multi-database support** - SQLite (default), MongoDB, PostgreSQL
- **constants.json** - customize everything in one place
- **Modern JavaScript** - no TypeScript complexity
- **Built-in hooks** - useListData, useForm for common patterns
- **API utilities** - apiRequest with automatic auth and error handling

<br />





## 📖 Frontend Configuration

Update `src/constants.json` to customize your app:

```json
{
  "appName": "Your App Name",
  "tagline": "Your Tagline", 
  "cta": "Get Started"
}
```

## 📖 Backend Configuration

**Database Configuration** - Update `backend/config.json`:

```json
{
  "client": "http://localhost:5173",
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

Update to `backend/.env`:

```bash
# Sqlite remove below
MONGODB_URL=mongodb+srv://user:pass@example-cluster.example.net/
POSTGRES_URL=postgresql://user:pass@example-hostname:5432/myapp
```

**Auth Variables** - Update to `backend/.env`:
enter a unique random string below

```bash
JWT_SECRET=your-secret-key
FREE_USAGE_LIMIT=20  # Optional: Monthly usage limit for free users (default: 20)
```

**Supported Database Types:**
- **SQLite** (default): `"dbType": "sqlite"`
- **PostgreSQL**: `"dbType": "postgresql"` with `"connectionString": "${POSTGRES_URL}"`
- **MongoDB**: `"dbType": "mongodb"` with `"connectionString": "${MONGODB_URL}"` with `"db": "SkateboardApp"`

<br />

## 💳 Stripe Setup

To enable payments, configure your Stripe products:

1. **Create Product in Stripe Dashboard**
   - Go to **Product Catalog** → **Create Product**
   - Add **Name** and **Amount**
   - Click **More Pricing Options**
   - Scroll to **Lookup Key** at bottom
   - Enter: `my_lookup_key`
   - *This allows future pricing changes on stripe.com without updating your code*

2. **Update Environment Variables**
   ```bash
   STRIPE_KEY=sk_live_your_secret_key
   ```
   
   **Security Note:** Use your secret key OR create a restricted key with these permissions:
   - **Read/Write:** Checkout Sessions
   - **Read:** Customers, Prices, Products

3. **Setup Webhook**
   - Go to **stripe.com** → **Developers** (lower left) → **Webhooks**
   - Click **Add Endpoint**
   - Add your endpoint URL: `https://yourdomain.com/payment`
   - Select these events:
     - `customer.subscription.created` - Customer signed up for new plan
     - `customer.subscription.deleted` - Customer's subscription ends  
     - `customer.subscription.updated` - Subscription changes (plan switch, trial to active, etc.)
   - Copy the **Signing Secret** to your environment:
   ```bash
   STRIPE_ENDPOINT_SECRET=whsec_your_webhook_secret
   ```


## 📈 Scaling Notes

The default configuration uses in-memory stores for rate limiting and CSRF tokens. This works great for single-instance deployments.

**For horizontal scaling** (multiple server instances):
- Replace in-memory rate limiter with Redis
- Move CSRF tokens to database or Redis
- Use sticky sessions or shared session store

See [Architecture Documentation](docs/ARCHITECTURE.md#scaling) for details.

## 🏗️ Tech Stack

Built with the latest and greatest:

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | v19 | UI Framework |
| **skateboard-ui** | v2.9+ | Application Shell Framework |
| **Vite** | v7.1+ | Build Tool & Dev Server |
| **Tailwind CSS** | v4.1+ | Styling |
| **Shadcn/ui** | Latest | Component Library |
| **React Router** | v7.8+ | Routing |
| **Hono** | v4+ | Backend Server |
| **Deno** | v2.3+ | Runtime |
| **Multi-Database** | Latest | SQLite, PostgreSQL, MongoDB |
| **Stripe** | Latest | Payments |
| **JWT** | Latest | Authentication |

<br />

## 📚 Architecture

Skateboard uses an **Application Shell Architecture** where the framework (skateboard-ui) provides structure and your app provides content.

**Your app in 3 parts:**
1. **Shell** (skateboard-ui) - Routing, auth, context, utilities
2. **Content** (your code) - Components and business logic
3. **Config** (constants.json) - App-specific settings

**Example main.jsx** (complete app):
```javascript
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView.jsx';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes });
```

That's it! The shell handles routing, auth, layout, landing page, sign in/up, settings, payment, and all legal pages.

**Learn more:**
- [Architecture Documentation](docs/ARCHITECTURE.md) - Deep dive into the shell pattern
- [Migration Guide](docs/MIGRATION.md) - Upgrade from any version

<br />

## 🚀 Deployment

See the [Deployment Guide](docs/DEPLOY.md) for step-by-step instructions:

- **Vercel** - Deploy both frontend and backend together (recommended)
- **Render** - Separate frontend and backend services
- **Netlify + Railway** - Netlify frontend with Railway backend
- **Docker** - Container deployment with included Dockerfile

<br />

## 🤝 Contributing

We love contributions!

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/skateboard
cd skateboard
deno install
deno run start
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


## 🚀 Ready to Ship?

```bash
npx create-skateboard-app
```

<br />

## 📄 License

MIT License - use it however you want! See [LICENSE](LICENSE) for details.

<br />

---

<div align="center">
  <p>
    Built with ❤️ by <a href="https://github.com/stevederico">Steve Derico</a> and contributors
  </p>
  
  <p>
    <a href="https://github.com/stevederico/skateboard">⭐ Star us on GitHub</a> — it helps!
  </p>
</div>
