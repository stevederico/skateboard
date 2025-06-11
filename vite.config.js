import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    customLoggerPlugin()
  ],
  esbuild: {
    drop: ['console', 'debugger']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@package': path.resolve(__dirname, 'package.json'),
      '@root': path.resolve(__dirname),
    }
  },
  optimizeDeps: {
    include: ['react-dom'],
  },
  server: {
    host: true,
    open: false,
  },
  logLevel: 'error'
})
