---
layout: default
title: Getting Started
description: Install Skateboard, run it locally, and learn the dev and build commands
---

# Getting Started

This guide walks you through installing Skateboard, running it for the first time, and the commands you'll use day to day.

## Prerequisites

- Node.js v22+
- Git

## Installation

The fastest way to start a new project is the create script. It scaffolds the app for you.

```bash
npx create-skateboard-app
```

Then move into the new project, install dependencies, and start it:

```bash
cd your-app
npm run install-all
npm run start
```

Your app runs at `http://localhost:5173` (frontend) with the backend on `http://localhost:8000`.

## Setup

1. **Install dependencies** (only needed if you cloned manually or want to reinstall)

   ```bash
   npm run install-all
   ```

   This runs `npm install && npm install --workspace=backend` — installing the root frontend dependencies and the `backend` workspace dependencies.

2. **Configure your app**

   Edit `src/constants.json`. The most common keys to set first:

   ```json
   {
     "appName": "Your App Name",
     "appIcon": "command",
     "tagline": "Try Something New",
     "backendURL": "/api",
     "devBackendURL": "http://localhost:8000/api"
   }
   ```

   The social/OpenGraph meta tags in `index.html` (`og:title`, `twitter:title`, `og:site_name`) are filled in automatically at build time from `appName` (via the `{{APP_NAME}}` token, replaced by the build's `htmlReplacePlugin`), so you don't edit those tags directly.

3. **Configure the backend**

   Edit `backend/config.json` to set the static dir and database:

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

   The frontend origin allowed by CORS is configured with the `CORS_ORIGINS` environment variable (in `backend/.env`), not a config.json key. In development it falls back to `localhost:5173`. See [Configuration](configuration.md) for the full set of keys.

## Development

Start both the frontend and backend together:

```bash
npm run start
```

This runs `npm run front & npm run server`:

- **Frontend** (Vite dev server): `http://localhost:5173`
- **Backend** (Hono server): `http://localhost:8000`

You can also run each side on its own:

```bash
npm run front     # Frontend only (Vite dev server on :5173)
npm run server    # Backend only (Hono server on :8000)
```

## Building for Production

```bash
npm run build     # Build the frontend (vite build --mode production)
npm run prod      # Build the frontend (vite build --mode production)
```

Both commands run `vite build --mode production` and output the compiled frontend to `dist/`. (`build` and `prod` are currently identical.)

## Updating the Boilerplate

Skateboard ships an update script that syncs boilerplate-owned files (server, adapters, build config) to the latest release without touching your app code, config, or environment files.

```bash
node scripts/update-skateboard.js          # interactive — review a diff per file
node scripts/update-skateboard.js --yes    # apply all changes without prompting
```

It updates a fixed allowlist (`backend/server.js`, `backend/server.test.js`, `backend/adapters/*`, `vite.config.js`, `Dockerfile`, `.dockerignore`, `.gitignore`, `scripts/update-skateboard.js`) and merges any new dependencies into `package.json`. It never modifies `src/constants.json`, `src/main.jsx`, `src/components/*`, `src/assets/styles.css`, `backend/config.json`, or `.env` files.

## Project Structure

```
skateboard/
├── src/
│   ├── components/        # Your views and components (HomeView.jsx, ChatView.jsx, ...)
│   ├── assets/
│   │   └── styles.css     # Brand color override (--color-app)
│   ├── main.jsx           # Route definitions (createSkateboardApp)
│   └── constants.json     # All app configuration
├── backend/
│   ├── server.js          # Hono server
│   ├── adapters/          # sqlite.js, postgres.js, mongodb.js, manager.js
│   ├── databases/         # SQLite database files
│   └── config.json        # Backend config (staticDir + database)
├── scripts/
│   └── update-skateboard.js
├── package.json
└── vite.config.js
```

Skateboard is a monorepo: the root is the React frontend (Vite + `@stevederico/skateboard-ui`), and the `backend` workspace is the Hono server with a multi-database adapter layer.

## Next Steps

- [Configure your app](configuration.md)
- [Set up authentication](authentication.md)
- [Configure Stripe](stripe.md)
- [Customize components](components.md)
- [Deploy your app](deployment.md)
