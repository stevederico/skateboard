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
    a react + rust starter with auth, stripe, shadcn, and sqlite
  </h3>

  <p align="center">
    <a href="https://stevederico.github.io/skateboard/"><strong>📖 Documentation</strong></a>
  </p>

</div>

<br />

## 🚀 Quick Start

```bash
npx create-skateboard-app
cd my-app
npm install
npm start                 # frontend  http://localhost:5173
cd backend && cargo run   # backend   http://localhost:8000
```

Frontend is Vite. Backend is Rust (`cargo run`). There is no `npm run server`.

<br />

## ✨ What's Included

Everything you need to ship a production-ready app:

### 🏗️ **Application Shell Architecture**
- **95% less boilerplate** - Focus on features, not infrastructure
- **Shell + Content + Config** - Framework provides structure, you provide content
- **Update once, fix everywhere** - All apps inherit improvements from skateboard-ui
- **16-line main.tsx** - Just define your routes
- **Convention over configuration** - Sensible defaults with escape hatches everywhere

### 🔐 **Authentication & User Management**
- **Sign up / Sign in** with native HS256 JWT in HttpOnly cookies
- **Protected routes** with automatic redirects
- **User context** management across your app
- **Session persistence** with secure cookies
- **scrypt password hashing** in the Rust backend (legacy bcrypt still verifies)
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
- **Zero-crate Rust backend** - empty `[dependencies]`; system libsqlite3 + libcurl
- **SQLite only** - no Postgres, no Mongo
- **constants.json** - customize everything in one place
- **TypeScript without a build step** - strict mode, Node 24 runs `.ts` natively, Vite compiles `.tsx`
- **Typecheck gates** - `npm run typecheck` for the frontend; `cargo test` for the backend
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

```bash
cd backend && cargo run     # listen on :8000
cd backend && cargo test --locked
```

**Database Configuration** - Update `backend/config.json`:

```json
{
  "staticDir": "../dist",
  "database": {
    "db": "MyApp",
    "dbType": "sqlite",
    "connectionString": "./databases/MyApp.db"
  }
}
```

**Auth Variables** - add to `backend/.env` (use a unique random string):

```bash
JWT_SECRET=your-secret-key
STRIPE_KEY=sk_test_...
STRIPE_ENDPOINT_SECRET=whsec_...
FREE_USAGE_LIMIT=20  # Optional: monthly usage limit for free users (default: 20)
```

**Database:** SQLite only (`"dbType": "sqlite"`). Postgres and Mongo are not supported.

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
   - Add your endpoint URL: `https://yourdomain.com/api/payment`
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

CSRF tokens and sign-in lockouts live in process memory. That is fine for one instance.

**Multiple instances:** move those stores to SQLite or another shared store. There is no rate limiter in this backend.

See [Guide → Architecture](docs/GUIDE.md#architecture) for details.

<br />

## 🪶 Dependency Footprint

Skateboard is intentionally lean — current footprint (counting what ships at runtime):

| | Frontend runtime | Frontend dev | Backend crates |
|---|---|---|---|
| Before (v2.x) | 12 | 4 | 7 |
| **Now** | **4** | **11** | **0** |

The backend is zero-crate Rust. JWT is HS256 HMAC, passwords are scrypt, leftover bcrypt hashes still verify then rehash. SQLite via system `libsqlite3`. Stripe via system `libcurl`. Do not `cargo add`.

The frontend pulls all its UI primitives from [`skateboard-ui`](https://github.com/stevederico/skateboard-ui), which itself runs on a single hard dep (`@base-ui/react`) plus optional peer deps for heavy components users opt into.

Frontend dev deps include `typescript` + `@types/*` for the strict typecheck plus `vitest` + `jsdom` for component tests (local `src/test/dom.js` helpers — no `@testing-library/*`) — all dev-only, zero runtime additions. There's still no build step for types: Node 24 strips them natively and Vite compiles `.tsx` directly.

<br />

## 🏗️ Tech Stack

Built with the latest and greatest:

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | v19 | UI Framework |
| **skateboard-ui** | v4.14.0 | Application Shell, Components, Theming |
| **Vite** | v8 | Build Tool & Dev Server (Oxc/Rolldown) |
| **Tailwind CSS** | v4.3+ | Styling |
| **React Router** | v7.15+ | Routing |
| **Rust** | 1.95 | Zero-crate backend |
| **TypeScript** | v7 | Frontend types (strict, no build step) |
| **Node.js** | v24+ | Frontend toolchain |
| **SQLite** | system lib | Database |
| **Stripe** | REST + libcurl | Payments |

<br />

## 📚 Architecture

Skateboard uses an **Application Shell Architecture** where the framework (skateboard-ui) provides structure and your app provides content.

**Your app in 3 parts:**
1. **Shell** (skateboard-ui) - Routing, auth, context, utilities
2. **Content** (your code) - Components and business logic
3. **Config** (constants.json) - App-specific settings

**Example main.tsx** (complete app):
```typescript
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView';

const appRoutes = [
  { path: 'home', element: <HomeView /> }
];

createSkateboardApp({ constants, appRoutes });
```

That's it! The shell handles routing, auth, layout, landing page, sign in/up, settings, payment, and all legal pages.

**Learn more:** [Documentation site](https://stevederico.github.io/skateboard/) for guides, or [docs/GUIDE.md](docs/GUIDE.md) for the consolidated reference (Architecture, API, Schema, Deployment, Migration).

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

Updates only files in the safe allowlist (`backend/src/*`, `vite.config.ts`, `Dockerfile`, etc.) and merges new deps into your `package.json`. Never touches your `constants.json`, `src/components/*`, `backend/config.json`, or `.env`.

See [docs/UPGRADE.md](docs/UPGRADE.md) for the full guide. 4.17.0 replaced the Node/Hono backend with zero-crate Rust — the updater deletes the old JS files. Backend commands are `cargo run` / `cargo test`, not npm.

<br />

## 🤝 Contributing

We love contributions!

```bash
# Fork the repo, then:
git clone https://github.com/YOUR_USERNAME/skateboard
cd skateboard
npm install
npm run start                 # frontend :5173
cd backend && cargo run       # backend :8000
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
- [Rust](https://www.rust-lang.org) - Zero-crate backend
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
