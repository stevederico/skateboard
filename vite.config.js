import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic'
    }),
    tailwindcss()
  ],
  esbuild: {
    drop: ['console', 'debugger'],
    jsxInject: `import React from 'react'`
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    },
    extensions: ['.js', '.jsx', '.json']
  },
  build: {
    minify: true,
    rollupOptions: {
      input: {
        client: resolve(__dirname, 'src/entry-client.jsx'),
        server: resolve(__dirname, 'src/entry-server.jsx')
      },
      output: {
        entryFileNames: '[name].js'
      }
    }
  },
  optimizeDeps: {
    include: ['react-router-dom', 'react-router-dom/server']
  },
  ssr: {
    external: ['react', 'react-dom'],
    noExternal: ['react-router-dom']
  }
})
