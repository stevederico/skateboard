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

const dynamicRobotsPlugin = () => {
  return {
    name: 'dynamic-robots',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      const website = constants.companyWebsite.startsWith('http') 
        ? constants.companyWebsite 
        : `https://${constants.companyWebsite}`;
      
      const robotsContent = `User-agent: Googlebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Bingbot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Applebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: facebookexternalhit
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Facebot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: Twitterbot
Disallow: /app/
Disallow: /console/
Disallow: /signin/
Disallow: /signup/

User-agent: *
Disallow: /

Sitemap: ${website}/sitemap.xml
`;

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsContent
      });
    }
  };
};

const dynamicSitemapPlugin = () => {
  return {
    name: 'dynamic-sitemap',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      const website = constants.companyWebsite.startsWith('http') 
        ? constants.companyWebsite 
        : `https://${constants.companyWebsite}`;
      
      const currentDate = new Date().toISOString().split('T')[0];
      
      const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${website}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${website}/terms</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${website}/privacy</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${website}/subs</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${website}/eula</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`;

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemapContent
      });
    }
  };
};

const dynamicManifestPlugin = () => {
  return {
    name: 'dynamic-manifest',
    generateBundle() {
      const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));
      
      const manifestContent = {
        short_name: constants.appName,
        name: constants.appName,
        description: constants.tagline,
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          }
        ],
        start_url: "./app",
        display: "standalone",
        theme_color: "#000000",
        background_color: "#ffffff"
      };

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifestContent, null, 2)
      });
    }
  };
};

export default defineConfig({
  plugins: [
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
      overlay: false,
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  logLevel: 'error'
})
