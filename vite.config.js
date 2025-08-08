import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const customLoggerPlugin = () => {
  return {
    name: 'custom-logger',
    configureServer(server) {
      const originalPrint = server.printUrls;
      server.printUrls = () => {
        console.log(`🖥️  React is running on http://localhost:${server.config.server.port || 5173}`);
      };
    }
  };
};

const htmlReplacePlugin = () => {
  return {
    name: 'html-replace',
    transformIndexHtml(html) {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      
      return html
        .replace(/{{APP_NAME}}/g, constants.appName)
        .replace(/{{TAGLINE}}/g, constants.tagline)
        .replace(/{{COMPANY_WEBSITE}}/g, constants.companyWebsite);
    }
  };
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    customLoggerPlugin(),
    htmlReplacePlugin()
  ],
  esbuild: {
    drop: ['console', 'debugger']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@package': path.resolve(__dirname, 'package.json'),
      '@root': path.resolve(__dirname),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime.js'),
    }
  },
  optimizeDeps: {
    include: ['react-dom', '@radix-ui/react-slot'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    host: 'localhost',
    open: false,
    port: 5173,
    strictPort: false,
    hmr: {
      port: 5173,
    },
    watch: {
      usePolling: false,
    },
  },
  logLevel: 'error'
})
