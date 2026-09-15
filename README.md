<div align="center">
  <a href="https://github.com/stevederico/skateboard">
    <img alt="Skateboard - Ship your React app in minutes" width="40%" src="https://github.com/user-attachments/assets/b7f2b098-503b-4439-8454-7eb45ae82307">
  </a>
  </div>

  <p align="center" style="margin-top: 40px; margin-bottom: 5px;">
    <img src="public/icons/icon.svg" width="60" height="60" alt="Skateboard Logo">
  </p>
  <h1 align="center" style="border-bottom: none; margin-bottom: 0;">Skateboard</h1>
  <h3 align="center" style="margin-top: 0; font-weight: normal;">
    a react + rust starter with auth, stripe, and sqlite
  </h3>

  <p align="center">
    <a href="https://stevederico.github.io/skateboard/"><strong>Documentation</strong></a>
  </p>

</div>

Replace `public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, and `og.png` when branding your app (favicon, PWA, Open Graph).

<br />

## Quick Start

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
- **Routes-only `main.tsx`** - Define routes, pass `constants.json`, done
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
- **Vite 8** with esbuild JSX (full reload on edit; no `@vitejs/plugin-react-swc`)
- **Zero-crate Rust backend** - empty `[dependencies]`; system libsqlite3 + libcurl
- **SQLite only** - no Postgres, no Mongo
- **constants.json** - customize everything in one place
- **TypeScript without a build step** - strict mode, Node 24 runs `.ts` natively, Vite compiles `.tsx`
- **Typecheck gates** - `npm run typecheck` for the frontend; `cargo test` for the backend
- **Built-in hooks** - `useListData` for list fetching
- **API utilities** - apiRequest with automatic auth and error handling
- **Icons** - named imports from `lucide-react` (no `@stevederico/skateboard-ui/icons`)

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
   - Select these events (every one the backend handles):
     - `checkout.session.completed` - Links the Stripe customer to the user after first purchase
     - `customer.subscription.created` - Customer signed up for new plan
     - `customer.subscription.updated` - Subscription changes (plan switch, trial to active, etc.)
     - `customer.subscription.deleted` - Customer's subscription ends
     - `invoice.paid` - Renewal succeeded; extends the paid-through date
     - `invoice.payment_failed` - Renewal failed; marks the subscription past due
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
| **Now** | **4** | **7** | **0** |

The backend is zero-crate Rust. JWT is HS256 HMAC, passwords are scrypt, leftover bcrypt hashes still verify then rehash. SQLite via system `libsqlite3`. Stripe via system `libcurl`. Do not `cargo add`.

The frontend pulls UI primitives from [`skateboard-ui`](https://github.com/stevederico/skateboard-ui). That package depends on `react-router` and (from 4.18+) `lucide-react` (pinned); peers are `react` and `react-dom`. Apps do not declare `react-router`. Navigate with `useSafeNavigate()`. Named-import icons from `lucide-react` (boilerplate also lists it). There is no `@stevederico/skateboard-ui/icons` path.

Frontend dev deps are Vite + Tailwind (`@tailwindcss/vite`) plus `typescript` + `@types/*` for the typecheck gate. No `@vitejs/plugin-react-swc`. No component-test runner. Node 24 strips types natively; Vite compiles `.tsx` via esbuild.

<br />

## 🏗️ Tech Stack

Built with the latest and greatest:

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | v19 | UI Framework |
| **skateboard** | v5.4.0 | Boilerplate (this repo) |
| **skateboard-ui** | v5.1.0 | Application Shell, Components, Theming |
| **Vite** | v8 | Build Tool & Dev Server (esbuild JSX) |
| **Tailwind CSS** | v4.3+ | Styling |
| **React Router** | v7.18+ | Routing (via skateboard-ui) |
| **lucide-react** | v0.546+ | Icons (named imports) |
| **Rust** | 1.95 | Zero-crate backend |
| **TypeScript** | v7 | Frontend types (strict, no build step) |
| **Node.js** | v24+ | Frontend toolchain |
| **SQLite** | system lib | Database |
| **Stripe** | REST + libcurl | Payments |

<br />

## Architecture

Application Shell: **skateboard-ui** owns routing, auth, layout, and theming; your app
supplies routes, components, and `constants.json`. Full write-up:
[docs/GUIDE.md](docs/GUIDE.md#architecture).

```typescript
import { createSkateboardApp } from '@stevederico/skateboard-ui/App';
import constants from './constants.json';
import HomeView from './components/HomeView';

createSkateboardApp({
  constants,
  appRoutes: [{ path: 'home', element: <HomeView /> }],
  loadLegal: () => import('./legal.json'),
});
```

<br />

**Learn more:** [Documentation site](https://stevederico.github.io/skateboard/) for guides, or [docs/GUIDE.md](docs/GUIDE.md) for the consolidated reference (Architecture, API, Schema, Deployment, Migration).

<br />

## Deployment

See [Guide → Deployment](docs/GUIDE.md#deployment) for step-by-step instructions on deploying to your preferred platform.

<br />

## ⬆️ Updating Boilerplate Files

Apps scaffolded from Skateboard can pull in upstream boilerplate updates with:

```bash
node scripts/update-skateboard.js          # interactive — diff per file
node scripts/update-skateboard.js --yes    # apply all without prompts
```

Updates only files in the safe allowlist (`backend/src/*`, `vite.config.ts`, `Dockerfile`, etc.) and merges new deps into your `package.json`. Never touches your `constants.json`, `src/components/*`, `backend/config.json`, or `.env`.

See [docs/UPGRADE.md](docs/UPGRADE.md) for the full guide. **5.0.0** is a breaking major — see [AGENTS.md → Migrating 4.x → 5.0](AGENTS.md#migrating-4x-50-exact-checklist).

<br />

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

- Frontend: `npm ci`, `npm run build`, `npm run test`
- Backend: `cargo test --locked` in `backend/`

Node **24** matches `package.json` `engines`.

<br />

## Contributing

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
