import { defineConfig, type UserConfig } from 'vite';
import path from 'node:path';
import {
  type Env,
  customLoggerPlugin,
  devBackendPortPlugin,
  envPort,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin
} from './vite.plugins.ts';

const DEFAULT_FRONTEND_PORT = 5173;

export function skateboardViteConfig({ env }: { env: Env }): UserConfig {
  return {
    plugins: [
      customLoggerPlugin(),
      htmlReplacePlugin(),
      dynamicRobotsPlugin(),
      dynamicSitemapPlugin(),
      dynamicManifestPlugin(),
      devBackendPortPlugin(env)
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(process.cwd(), './src')
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      exclude: ['@stevederico/skateboard-ui', 'lightningcss', 'fsevents']
    },
    server: {
      host: 'localhost',
      open: false,
      port: envPort(env, 'SKATEBOARD_FRONTEND_PORT', DEFAULT_FRONTEND_PORT),
      strictPort: Boolean(env.SKATEBOARD_FRONTEND_PORT),
      watch: {
        usePolling: false,
        ignored: ['**/node_modules/**', '**/.git/**']
      }
    },
    logLevel: 'info'
  };
}

export default defineConfig(skateboardViteConfig({ env: process.env }));
