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
  <img width="75%" alt="landing" src="https://github.com/user-attachments/assets/db1d9cb7-e398-4c87-a245-14371f37a38b" />
</div>

  <br />
 

</div>

<br />

## 🚀 Quick Start

Get your app running in less than 10 seconds:

```bash
npx create-skateboard-app
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


## 📖 Configuration

### Frontend Configuration

Update `src/constants.json` to customize your app:

```json
{
  "appName": "Your App Name",
  "tagline": "Your Tagline", 
  "cta": "Get Started"
}
```

### Backend Configuration

**Environment Variables** - Add to `backend/.env`:

```bash
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=sk_test_...

# Database (production)
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/myapp
POSTGRES_URL=postgresql://user:pass@hostname:5432/myapp
```

**Database Configuration** - Update `backend/config.json`:

```json
[{
  "db": "MyApp",
  "origin": "http://localhost:5173",
  "dbType": "sqlite",
  "connectionString": "./databases/MyApp.db"
}]
```

**Supported Database Types:**
- **SQLite** (default): `"dbType": "sqlite"`
- **PostgreSQL**: `"dbType": "postgresql"` with `"connectionString": "${POSTGRES_URL}"`
- **MongoDB**: `"dbType": "mongodb"` with `"connectionString": "${MONGODB_URL}"`

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
