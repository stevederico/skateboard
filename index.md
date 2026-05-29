---
layout: default
title: Welcome to Skateboard
description: A React starter with auth, Stripe, shadcn/ui, and SQLite — ship your app in minutes
---

<div class="nav-cards">
    <a href="/getting-started" class="nav-card">
        <div class="nav-card-title">🚀 Getting Started</div>
        <div class="nav-card-description">Scaffold Skateboard and run frontend + backend in minutes</div>
    </a>

    <a href="/configuration" class="nav-card">
        <div class="nav-card-title">⚙️ Configuration</div>
        <div class="nav-card-description">Set up constants.json, backend config.json, and environment variables</div>
    </a>

    <a href="/components" class="nav-card">
        <div class="nav-card-title">🎨 Components</div>
        <div class="nav-card-description">Shadcn/ui components from skateboard-ui, with semantic design tokens</div>
    </a>

    <a href="/authentication" class="nav-card">
        <div class="nav-card-title">🔐 Authentication</div>
        <div class="nav-card-description">Native HS256 JWT in HttpOnly cookies, CSRF protection, and scrypt hashing</div>
    </a>

    <a href="/stripe" class="nav-card">
        <div class="nav-card-title">💳 Stripe Integration</div>
        <div class="nav-card-description">Checkout, customer portal, and signature-verified webhooks</div>
    </a>

    <a href="/deployment" class="nav-card">
        <div class="nav-card-title">🚀 Deployment</div>
        <div class="nav-card-description">Deploy to Vercel, Render, Netlify + Railway, or Docker</div>
    </a>

    <a href="/api" class="nav-card">
        <div class="nav-card-title">📚 API Reference</div>
        <div class="nav-card-description">Backend endpoints, env vars, and the database adapter layer</div>
    </a>

    <a href="/examples" class="nav-card">
        <div class="nav-card-title">💡 Examples</div>
        <div class="nav-card-description">Patterns for views, data fetching, and usage-gated features</div>
    </a>
</div>

## What is Skateboard?

Skateboard is a production-ready React starter built on an **Application Shell Architecture**: the shell (`@stevederico/skateboard-ui`) owns routing, auth, layout, and build utilities, so your app code is just routes, views, and config. Everything you need to ship a modern web app is included:

- ⚡ **React 19** with Vite 8 for fast development (SWC, no Babel)
- 🎨 **Tailwind CSS v4** with Shadcn/ui components from skateboard-ui
- 🔐 **Authentication** — native HS256 JWT in HttpOnly cookies, CSRF protection, scrypt password hashing (zero external auth deps)
- 💳 **Stripe** integration for checkout, the customer portal, and webhooks
- 🗄️ **Multi-database** backend on Hono — SQLite by default, with PostgreSQL and MongoDB adapters
- 📱 **Responsive** layout with a mobile-ready sidebar and TabBar
- 🌙 **Dark mode** with system detection
- 🛡️ **Protected routes**, account lockout, and usage tracking for free-tier limits

## Quick Start

```bash
npx create-skateboard-app
```

That's it — your app is now running at `http://localhost:5173` with the frontend, a complete authentication system, Stripe integration, and beautiful UI components.

To run the frontend and backend together during development:

```bash
npm run start          # Frontend (Vite :5173) + backend (Hono :8000)
npm run front          # Frontend only
npm run server         # Backend only
```

## Why Skateboard?

**⏰ Save Time** — Skip the boilerplate and focus on your unique features

**🛡️ Battle-tested** — Built with security and best practices in mind

**🎨 Beautiful** — Modern design system with dark mode, driven by semantic tokens

**📱 Mobile-first** — Responsive design that works on every device

**🔧 Customizable** — Convention over configuration, with escape hatches everywhere

## Updating the Boilerplate

Skateboard ships an update script that syncs only boilerplate-owned files (`backend/server.js`, `backend/adapters/*`, `vite.config.js`, `Dockerfile`, and more) and never touches your `constants.json`, components, or env:

```bash
node scripts/update-skateboard.js          # interactive — diff per file
node scripts/update-skateboard.js --yes    # apply all without prompts
```

## Community

- [GitHub Repository](https://github.com/stevederico/skateboard)
- [Issues & Bug Reports](https://github.com/stevederico/skateboard/issues)
- [Feature Requests](https://github.com/stevederico/skateboard/discussions)
