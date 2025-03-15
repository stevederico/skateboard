import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Get the current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  esbuild: {
    drop: ['console', 'debugger']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@nodemodules': path.resolve(__dirname, 'node_modules/'),
      '@package': path.resolve(__dirname, 'package.json'),
      '@root': path.resolve(__dirname),
    }
  }
})
