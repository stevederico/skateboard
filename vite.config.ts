import { defineConfig } from 'vite';
import type { ESBuildOptions } from 'vite';
import tailwindcss from '@tailwindcss/vite';
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
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin(),
    dynamicRobotsPlugin(),
    dynamicSitemapPlugin(),
    dynamicManifestPlugin()
  ],
  // Vite 8 ships without esbuild installed, so its ESBuildOptions type loses
  // esbuild's TransformOptions fields (including `drop`); cast keeps the
  // option exactly as-is without a runtime change.
  // JSX: Vite's esbuild transform (no @vitejs/plugin-react-swc) — full reload on edit.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    drop: []
  } as ESBuildOptions,
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'],
    alias: {
      '@': path.resolve(process.cwd(), './src'),
      '@package': path.resolve(process.cwd(), 'package.json'),
      '@root': path.resolve(process.cwd()),
      'react': path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(process.cwd(), 'node_modules/react/jsx-runtime.js')
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@radix-ui/react-slot',
      'react-router-dom',
      'react-router',
      'cookie',
      'set-cookie-parser'
    ],
    exclude: [
      '@stevederico/skateboard-ui',
      '@tailwindcss/oxide',
      '@tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide-darwin-x64',
      '@tailwindcss/oxide-linux-x64-gnu',
      '@tailwindcss/oxide-linux-x64-musl',
      '@tailwindcss/oxide-win32-x64-msvc',
      'lightningcss',
      'fsevents'
    ],
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      }
    }
  },
  build: {
    rollupOptions: {
      external: [
        /\.node$/,
        /@tailwindcss\/oxide/
      ]
    }
  },
  server: {
    host: 'localhost',
    open: false,
    port: 5173,
    strictPort: false,
    // Don't pin the HMR port — Vite derives it from the resolved server port.
    // Hardcoding 5173 broke HMR ("WebSocket closed without opened") whenever
    // 5173 was taken and the server fell back to 5174 while HMR still dialed 5173.
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  logLevel: 'error'
});
