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

### 🏗️ **Application Shell Architecture**
- **95% less boilerplate** - Focus on features, not infrastructure
- **Shell + Content + Config** - Framework provides structure, you provide content
- **Update once, fix everywhere** - All apps inherit improvements from skateboard-ui
- **16-line main.jsx** - Just define your routes
- **Convention over configuration** - Sensible defaults with escape hatches everywhere

### 🔐 **Authentication & User Management**
- **Sign up / Sign in** with native HS256 JWT in HttpOnly cookies
- **Protected routes** with automatic redirects
- **User context** management across your app
- **Session persistence** with secure cookies
- **scrypt password hashing** via `node:crypto` (zero external deps)
- **Usage tracking** with configurable limits for free users

### 💳 **Stripe Integration**
- **Checkout flows** ready to go
- **Subscription management** portal
- **Webhook handling** for payment events
- **Customer portal** integration

### 🎨 **Beautiful UI Components**
- **Shadcn/ui components** via skateboard-ui
- **Dark/Light mode** with system detection
- **Mobile-ready design** with responsive sidebar and TabBar
- **Landing page** that converts - fully customizable via constants.json
- **Settings page** with user management
- **Legal pages** (Terms, Privacy, EULA)

### 🛠️ **Developer Experience**
- **Hot Module Replacement** with Vite 8
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

For Postgres or Mongo, point `connectionString` at the relevant env var:

```bash
# backend/.env
MONGODB_URL=mongodb+srv://user:pass@example-cluster.example.net/
POSTGRES_URL=postgresql://user:pass@example-hostname:5432/myapp
```

**Auth Variables** - add to `backend/.env` (use a unique random string):

```bash
JWT_SECRET=your-secret-key
FREE_USAGE_LIMIT=20  # Optional: monthly usage limit for free users (default: 20)
```

**Supported Database Types:**
- **SQLite** (default): `"dbType": "sqlite"`
- **PostgreSQL**: `"dbType": "postgresql"` with `"connectionString": "${POSTGRES_URL}"`
- **MongoDB**: `"dbType": "mongodb"` with `"connectionString": "${MONGODB_URL}"` and `"db": "SkateboardApp"`

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

<br />

## 📈 Scaling Notes

The default configuration uses in-memory stores for rate limiting and CSRF tokens. This works great for single-instance deployments.

**For horizontal scaling** (multiple server instances):
- Replace in-memory rate limiter with Redis
- Move CSRF tokens to database or Redis
- Use sticky sessions or shared session store

See [Guide → Architecture](docs/GUIDE.md#architecture) for details.

<br />

## 🪶 Dependency Footprint

Skateboard is intentionally lean. As of v3.3.0:

| | Frontend runtime | Frontend dev | Backend runtime |
|---|---|---|---|
| Before (v2.x) | 12 | 4 | 7 |
| **Now (v3.3.0)** | **4** | **4** | **3** |

Backend `jsonwebtoken` and `bcryptjs` were both dropped — JWT signing/verification now uses `node:crypto` HMAC, and password hashing uses `node:crypto` scrypt. Legacy bcrypt hashes from older versions still verify (vendored at `backend/vendor/legacy-bcrypt.js`) and are silently re-hashed to scrypt on next login.

Backend `pg` and `mongodb` are not hard deps — `create-skateboard-app` injects only the driver you pick at scaffold time, and the adapter manager lazy-loads them so SQLite-only installs never resolve the others.

The frontend pulls all its UI primitives from [`skateboard-ui`](https://github.com/stevederico/skateboard-ui), which itself runs on a single hard dep (`@base-ui/react`) plus optional peer deps for heavy components users opt into.

<br />

## 🏗️ Tech Stack

Built with the latest and greatest:

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | v19 | UI Framework |
| **skateboard-ui** | v3.6+ | Application Shell, Components, Theming |
| **Vite** | v8 | Build Tool & Dev Server (Oxc/Rolldown) |
| **Tailwind CSS** | v4.3+ | Styling |
| **React Router** | v7.15+ | Routing |
| **Hono** | v4.7+ | Backend Server |
| **Node.js** | v22+ | Runtime |
| **Multi-Database** | Latest | SQLite, PostgreSQL, MongoDB |
| **Stripe** | v18+ | Payments |
| **node:crypto** | built-in | JWT + scrypt password hashing |

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

**Learn more:** [Guide](docs/GUIDE.md) - Architecture, API, Schema, Deployment, Migration (consolidated)

<br />

## 🚀 Deployment

See [Guide → Deployment](docs/GUIDE.md#deployment) for step-by-step instructions on deploying to your preferred platform.

<br />

## ⬆️ Updating Boilerplate Files

Apps scaffolded from Skateboard can pull in upstream boilerplate updates with:

```bash
node scripts/update-skateboard.js          # interactive — diff per file
node scripts/update-skateboard.js --yes    # apply all without prompts
```

Updates only files in the safe allowlist (`backend/server.js`, `backend/adapters/*`, `vite.config.js`, `Dockerfile`, etc.) and merges new deps into your `package.json`. Never touches your `constants.json`, `src/components/*`, `backend/config.json`, or `.env`.

<br />

## 🤝 Contributing

We love contributions!

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
- [Hono](https://hono.dev) - Lightweight web framework
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
