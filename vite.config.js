import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    sourcemap: false
  },
  css: {
    devSourcemap: false
  },
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
})
