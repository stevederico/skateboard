import { defineConfig } from 'vite';

const customLoggerPlugin = () => ({
    name: 'custom-logger',
    configureServer(server) {
        server.printUrls = () => {
            const port = server.config.server.port || 5173;
            console.log(`React dev server running on http://localhost:${port}`);
        };
    }
});

const htmlReplacePlugin = () => ({
    name: 'html-replace',
    async transformIndexHtml(html) {
        const { readFileSync } = await import('node:fs');
        const constants = JSON.parse(readFileSync('src/constants.json', 'utf8'));

        return html
            .replace(/{{APP_NAME}}/g, constants.appName)
            .replace(/{{TAGLINE}}/g, constants.tagline)
            .replace(/{{COMPANY_WEBSITE}}/g, constants.companyWebsite);
    }
});

const dynamicRobotsPlugin = () => ({
    name: 'dynamic-robots',
    async generateBundle() {
        const { readFileSync } = await import('node:fs');
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
});

const dynamicSitemapPlugin = () => ({
    name: 'dynamic-sitemap',
    async generateBundle() {
        const { readFileSync } = await import('node:fs');
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
});

const dynamicManifestPlugin = () => ({
    name: 'dynamic-manifest',
    async generateBundle() {
        const { readFileSync } = await import('node:fs');
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
});

async function createSkateboardViteConfig(customConfig = {}) {
    const [{ default: react }, { default: tailwindcss }, path] = await Promise.all([
        import('@vitejs/plugin-react-swc'),
        import('@tailwindcss/vite'),
        import('node:path')
    ]);

    return {
        plugins: [
            react(),
            tailwindcss(),
            customLoggerPlugin(),
            htmlReplacePlugin(),
            dynamicRobotsPlugin(),
            dynamicSitemapPlugin(),
            dynamicManifestPlugin(),
            ...(customConfig.plugins || [])
        ],
        esbuild: {
            drop: []
        },
        resolve: {
            alias: {
                '@': path.resolve(process.cwd(), './src'),
                '@package': path.resolve(process.cwd(), 'package.json'),
                '@root': path.resolve(process.cwd()),
                'react/jsx-runtime': path.resolve(process.cwd(), 'node_modules/react/jsx-runtime.js'),
                ...(customConfig.resolve?.alias || {})
            }
        },
        optimizeDeps: {
            include: [
                'react',
                'react-dom',
                'react-dom/client',
                '@radix-ui/react-slot',
                'cookie',
                'set-cookie-parser'
            ],
            exclude: [
                '@swc/core',
                '@swc/core-darwin-arm64',
                '@swc/wasm',
                '@tailwindcss/oxide',
                '@tailwindcss/oxide-darwin-arm64',
                'lightningcss',
                'fsevents'
            ],
            esbuildOptions: {
                target: 'esnext',
                define: {
                    global: 'globalThis'
                }
            },
            ...(customConfig.optimizeDeps || {})
        },
        server: {
            host: '127.0.0.1',
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
            },
            ...(customConfig.server || {})
        },
        logLevel: 'error',
        ...customConfig
    };
}

export default defineConfig(async () => {
    return createSkateboardViteConfig();
});
