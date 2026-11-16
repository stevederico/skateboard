import { defineConfig } from 'vite';
import path from 'node:path';
import {
  customLoggerPlugin,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin
} from './vite.plugins.ts';

// ===== VITE CONFIGURATION =====

export default defineConfig({
  plugins: [
    customLoggerPlugin(),
    htmlReplacePlugin(),
    dynamicRobotsPlugin(),
    dynamicSitemapPlugin(),
    dynamicManifestPlugin()
  ],
  // JSX comes from tsconfig ("jsx": "react-jsx") via Vite's own transform — no
  // @vitejs/plugin-react-swc, so edits trigger a full reload instead of Fast Refresh.
  resolve: {
    // One React copy for the app and skateboard-ui. react-router is not listed: it is
    // vendored inside skateboard-ui (5.16+) and imported from '@stevederico/skateboard-ui/router'.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(process.cwd(), './src')
    }
  },
  optimizeDeps: {
    // skateboard-ui is excluded from prebundling, so its raw imports resolve straight to
    // these packages — every one it reaches for must be pre-converted to ESM, including
    // react/jsx-runtime (its compiled JSX imports it and React ships CJS).
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    // skateboard-ui ships pre-built ESM; the native/CSS toolchain must never be prebundled.
    exclude: ['@stevederico/skateboard-ui', 'lightningcss', 'fsevents']
  },
  server: {
    host: 'localhost',
    open: false,
    port: 5173,
    strictPort: false,
    // HMR is left at its defaults on purpose: the error overlay surfaces build failures
    // instead of hiding them, and pinning the HMR port broke reloads ("WebSocket closed
    // without opened") whenever 5173 was taken and the server fell back to 5174.
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  // 'info' keeps the production bundle report visible; customLoggerPlugin trims dev noise.
  logLevel: 'info'
});
