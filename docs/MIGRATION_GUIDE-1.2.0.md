# Migration Guide: skateboard-ui 1.2.0

## Overview
Version 1.2.0 introduces a critical architectural change that separates build-time configuration from runtime utilities. This change was necessary to support Tailwind CSS v4 and resolve bundling issues with native modules.

## Breaking Changes

### 1. Vite Configuration Import Path Changed

**Before (1.1.x):**
```javascript
// vite.config.js
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';
```

**After (1.2.0):**
```javascript
// vite.config.js
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/ViteConfig';
```

### 2. Utilities Export No Longer Contains Build Configuration

The `Utilities` export now only contains runtime utilities. All Vite-related plugins and build configuration have been moved to the new `ViteConfig` export.

## Migration Steps

### Step 1: Update skateboard-ui
```bash
npm update @stevederico/skateboard-ui@1.2.0
```

### Step 2: Update vite.config.js
Change your import statement to use the new ViteConfig export:

```javascript
// Old
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';

// New
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/ViteConfig';
```

### Step 3: Rebuild Your Project
```bash
npm run build
```

## Why This Change?

The previous architecture mixed runtime and build-time code in a single file. When applications imported runtime utilities, Vite attempted to bundle the entire file including Vite plugins and their dependencies. This caused issues with:

- Tailwind CSS v4's native binary modules (@tailwindcss/oxide)
- CommonJS resolver errors
- Build-time dependencies being unnecessarily bundled

By separating these concerns:
- **ViteConfig.js**: Contains all build-time configuration (Vite plugins, config generator)
- **Utilities.js**: Contains only runtime utilities (authentication, cookies, API helpers)

## What's New

### ViteConfig Export
New dedicated export for all Vite configuration:
- `getSkateboardViteConfig()` - Main configuration generator
- `customLoggerPlugin()` - Custom logging plugin
- `htmlReplacePlugin()` - HTML template replacement
- `dynamicRobotsPlugin()` - Dynamic robots.txt generation
- `dynamicSitemapPlugin()` - Dynamic sitemap.xml generation
- `dynamicManifestPlugin()` - Dynamic manifest.json generation

### Improved Compatibility
- Full support for Tailwind CSS v4
- Better handling of native modules
- Cleaner separation of concerns
- Reduced bundle size for runtime code

## Troubleshooting

### Error: Cannot find module '@stevederico/skateboard-ui/Utilities'
If you see this error during build, you haven't updated your vite.config.js import yet. Follow Step 2 above.

### Build Failures with Native Modules
Ensure you're using skateboard-ui 1.2.0 or later and have updated your import path.

### TypeScript Issues
If using TypeScript, you may need to update your type imports:
```typescript
// If you have custom types referencing the old structure
import type { SkateboardConfig } from '@stevederico/skateboard-ui/ViteConfig';
```

## Backwards Compatibility
This is a breaking change. Projects using skateboard-ui 1.1.x or earlier must update their vite.config.js import to use the new ViteConfig export.

## Support
For issues or questions about this migration:
- GitHub Issues: https://github.com/stevederico/skateboard-ui/issues
- Documentation: https://github.com/stevederico/skateboard-ui

## Example Migration

Here's a complete before/after example:

**Before (1.1.x):**
```javascript
// vite.config.js
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/Utilities';

const config = await getSkateboardViteConfig();

export default config;
```

**After (1.2.0):**
```javascript
// vite.config.js
import { getSkateboardViteConfig } from '@stevederico/skateboard-ui/ViteConfig';

const config = await getSkateboardViteConfig();

// Optional: Add custom configuration
config.optimizeDeps.include = [
  ...(config.optimizeDeps.include || []),
  'your-custom-package'
];

export default config;
```

## Version Compatibility Matrix

| skateboard-ui | Tailwind CSS | Vite | Node.js |
|--------------|--------------|------|---------|
| 1.2.0        | 4.x          | 7.x  | 18+     |
| 1.1.x        | 3.x          | 5.x  | 16+     |

## Changelog

### Added
- New `ViteConfig` export for all build-time configuration
- Full Tailwind CSS v4 support
- Better error messages for configuration issues

### Changed
- Moved all Vite plugins from Utilities.js to ViteConfig.js
- Improved module resolution for native dependencies
- Updated peer dependencies for React 19 and React Router 7

### Fixed
- Build failures with Tailwind CSS v4
- CommonJS resolver errors with native modules
- Unnecessary bundling of build-time dependencies