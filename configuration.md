# Configuration

Learn how to configure Skateboard for your specific needs.

## App Configuration

The main configuration file is `src/constants.json`:

```json
{
  "appName": "Skateboard",
  "supportEmail": "support@skateboard.com",
  "stripePublishableKey": "pk_test_...",
  "features": {
    "auth": true,
    "stripe": true,
    "darkMode": true
  },
  "navigation": {
    "showHome": true,
    "showSettings": true,
    "showOther": true
  },
  "legal": {
    "privacyPolicy": "/privacy",
    "termsOfService": "/terms",
    "eula": "/eula"
  }
}
```

## Backend Configuration

Configure your backend in `backend/config.json`:

```json
{
  "port": 3001,
  "cors": {
    "origin": "http://localhost:5173",
    "credentials": true
  },
  "database": {
    "url": "mongodb://localhost:27017/skateboard"
  },
  "stripe": {
    "secretKey": "sk_test_...",
    "webhookSecret": "whsec_..."
  }
}
```

## Environment Variables

Create `.env` files for sensitive data:

### Frontend (.env)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_API_URL=http://localhost:3001
```

### Backend (backend/.env)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
MONGODB_URL=mongodb://localhost:27017/skateboard
JWT_SECRET=your-jwt-secret
```

## Customization Options

### App Metadata

Update `public/manifest.json`:
```json
{
  "name": "Your App Name",
  "short_name": "YourApp",
  "description": "Your app description",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

### SEO

Update `index.html`:
```html
<meta name="description" content="Your app description">
<meta property="og:title" content="Your App Name">
<meta property="og:description" content="Your app description">
```

## Feature Flags

Enable/disable features in `constants.json`:

```json
{
  "features": {
    "auth": true,           // Show auth pages
    "stripe": true,         // Enable payments
    "darkMode": true,       // Dark mode toggle
    "sidebar": true,        // Collapsible sidebar
    "tabBar": true,         // Mobile tab bar
    "landing": true         // Landing page
  }
}
```

## Styling

### Colors

Customize colors in `src/assets/styles.css`:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --accent: 210 40% 96%;
}
```

### Fonts

Add custom fonts to `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

Then update CSS:
```css
body {
  font-family: 'Inter', sans-serif;
}
```
