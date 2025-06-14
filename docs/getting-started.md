# Getting Started

This guide will help you set up Skateboard and start building your application.

## Prerequisites

- Node.js 18+ or Deno 2.2+
- Git

## Installation

### Option 1: Using degit (Recommended)

```bash
npx degit stevederico/skateboard my-project-name
cd my-project-name
```

### Option 2: Clone and customize

```bash
git clone https://github.com/stevederico/skateboard.git
cd skateboard
rm -rf .git
git init
```

## Setup

1. **Install dependencies**
   ```bash
   npm install
   npm run install-all
   ```

2. **Configure your app**
   
   Edit `src/constants.json`:
   ```json
   {
     "appName": "Your App Name",
     "supportEmail": "support@yourapp.com",
     "stripePublishableKey": "pk_test_..."
   }
   ```

3. **Update app title**
   
   Edit `index.html`:
   ```html
   <title>Your App Name</title>
   ```

## Development

Start the development server:

```bash
npm run dev
```

This starts both:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Project Structure

```
skateboard/
├── src/
│   ├── components/        # React components
│   ├── assets/           # Static assets
│   └── constants.json    # App configuration
├── backend/
│   ├── server.js         # Express server
│   └── config.json       # Backend config
└── public/               # Public assets
```

## Next Steps

- [Configure your app](configuration.md)
- [Set up authentication](authentication.md)
- [Configure Stripe](stripe.md)
- [Customize components](components.md)
