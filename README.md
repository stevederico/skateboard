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

## 🎬 Demo

<div align="left">
  <img width="100%" alt="landing" src="https://github.com/user-attachments/assets/db1d9cb7-e398-4c87-a245-14371f37a38b" />
</div>

  <br />
 
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

### App Settings

Update `src/constants.json` to customize your app:

```json
{
  "appName": "Your App Name",
  "tagline": "Your Tagline", 
  "cta": "Get Started"
}
```

### Environment Variables

Add to `backend/.env`:

```bash
JWT_SECRET=your-secret-key
STRIPE_SECRET_KEY=sk_test_...

# Database (production)
DATABASE_URL=your-database-connection-string
MONGODB_URL=mongodb+srv://user:pass@cluster.mongodb.net/myapp
POSTGRES_URL=postgresql://user:pass@hostname:5432/myapp
```

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
