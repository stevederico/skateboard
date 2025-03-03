import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Get the current directory
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command, mode }) => {
  const isSSR = process.env.SSR === 'true'
  
  return {
    plugins: [react(), tailwindcss()],
    esbuild: {
      drop: ['console', 'debugger']
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    build: {
      outDir: isSSR ? 'dist/server' : 'dist/client',
      emptyOutDir: true,
      manifest: !isSSR,
      rollupOptions: {
        input: isSSR ? './src/entry-server.jsx' : './index.html',
        output: {
          format: isSSR ? 'esm' : undefined
        }
      }
    },
    ssr: {
      // External packages that shouldn't be bundled into the SSR build
      external: ['react', 'react-dom'],
      // Make specific react-router packages work inside SSR bundle
      noExternal: ['react-router-dom']
    }
  }
})
