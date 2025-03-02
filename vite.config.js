import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: {
    drop: ['console', 'debugger']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
