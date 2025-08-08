<div align="center">
  <a href="#" />
    <img alt="Skateboard - Ship your React app in minutes" width="50%" src="https://github.com/user-attachments/assets/b7f2b098-503b-4439-8454-7eb45ae82307">
  </a>
  
  <h1 align="center">🛹 &nbsp; Skateboard</h1>
  
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
- **Landing page** that converts
- **Settings page** with user management
- **Legal pages** (Terms, Privacy, EULA)

### 🛠️ **Developer Experience**
- **Hot Module Replacement** with Vite 7
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
| **Vite** | v7 | Build Tool & Dev Server |
| **Tailwind CSS** | v4 | Styling |
| **Shadcn/ui** | Latest | Component Library |
| **React Router** | v7.2+ | Routing |
| **Express** | v4 | Backend Server |
| **SQLite** | v3 | Database |
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
│   ├── databases/       # SQLite databases
│   └── config.json      # Backend config
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

## 📖 Documentation

### Configuration

All app configuration is in `src/constants.json`:

```json
{
  "appName": "Your App Name",
  "appIcon": "command",
  "tagline": "Your Tagline",
  "backendURL": "http://localhost:8000",
  "stripeProducts": [{
    "price": "$9.99",
    "title": "Pro Plan",
    "interval": "monthly",
    "lookup_key": "pro_monthly"
  }]
}
```

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
