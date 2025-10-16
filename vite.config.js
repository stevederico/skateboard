import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Import the plugins directly from skateboard-ui
import {
  customLoggerPlugin,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin
} from '@stevederico/skateboard-ui/Utilities';

// Custom plugin to handle native modules
const nativeModuleHandler = () => ({
  name: 'native-module-handler',
  enforce: 'pre',
  resolveId(id) {
    // Handle native binary modules
    if (id.endsWith('.node') || id.includes('@tailwindcss/oxide')) {
      return { id, external: true };
    }
    return null;
  },
  load(id) {
    if (id.endsWith('.node')) {
      // Return empty module for native binaries
      return 'export default {}';
    }
  }
});

export default defineConfig({
  plugins: [
    nativeModuleHandler(),
    react(),
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin(),
    dynamicRobotsPlugin(),
    dynamicSitemapPlugin(),
    dynamicManifestPlugin()
  ],
  esbuild: {
    drop: []
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
      '@package': path.resolve(process.cwd(), 'package.json'),
      '@root': path.resolve(process.cwd()),
      'react/jsx-runtime': path.resolve(process.cwd(), 'node_modules/react/jsx-runtime.js')
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      '@radix-ui/react-slot'
    ],
    exclude: [
      '@swc/core',
      '@swc/core-darwin-arm64',
      '@swc/wasm',
      '@tailwindcss/oxide',
      '@tailwindcss/oxide-darwin-arm64',
      '@tailwindcss/oxide-darwin-x64',
      '@tailwindcss/oxide-linux-x64-gnu',
      '@tailwindcss/oxide-linux-x64-musl',
      '@tailwindcss/oxide-win32-x64-msvc',
      'lightningcss',
      'fsevents',
      'cookie',
      'set-cookie-parser'
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
    hmr: {
      port: 5173,
      overlay: false
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    }
  },
  logLevel: 'error'
});
