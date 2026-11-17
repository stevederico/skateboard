import { readFileSync } from 'node:fs';
import type { Plugin, ViteDevServer } from 'vite';

interface AppConstants {
  appName: string;
  tagline: string;
  companyWebsite: string;
}

let constantsReader: () => string = () => readFileSync('src/constants.json', 'utf8');

export function __setConstantsReaderForTests(reader: () => string): void {
  constantsReader = reader;
}

function readConstants(): AppConstants {
  const parsed: unknown = JSON.parse(constantsReader());
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('appName' in parsed) ||
    !('tagline' in parsed) ||
    !('companyWebsite' in parsed)
  ) {
    throw new Error('constants.json: missing appName, tagline, or companyWebsite');
  }
  const { appName, tagline, companyWebsite } = parsed;
  if (
    typeof appName !== 'string' ||
    typeof tagline !== 'string' ||
    typeof companyWebsite !== 'string'
  ) {
    throw new Error('constants.json: appName, tagline, and companyWebsite must be strings');
  }
  return { appName, tagline, companyWebsite };
}

function toAbsoluteUrl(website: string): string {
  return website.startsWith('http') ? website : `https://${website}`;
}

function serveGenerated(
  server: ViteDevServer,
  route: string,
  contentType: string,
  build: () => string
): void {
  server.middlewares.use(route, (_req, res) => {
    res.setHeader('Content-Type', contentType);
    res.end(build());
  });
}

export const customLoggerPlugin = (): Plugin => {
  return {
    name: 'custom-logger',
    configureServer(server) {
      server.printUrls = () => {
        console.log(`React is running on http://localhost:${server.config.server.port || 5173}`);
      };
    }
  };
};

export const htmlReplacePlugin = (): Plugin => {
  return {
    name: 'html-replace',
    transformIndexHtml(html) {
      const constants = readConstants();

      return html
        .replace(/{{APP_NAME}}/g, constants.appName)
        .replace(/{{TAGLINE}}/g, constants.tagline)
        .replace(/{{COMPANY_WEBSITE}}/g, constants.companyWebsite);
    }
  };
};

export const dynamicRobotsPlugin = (): Plugin => {
  return {
    name: 'dynamic-robots',
    configureServer(server) {
      serveGenerated(server, '/robots.txt', 'text/plain; charset=utf-8', buildRobotsTxt);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobotsTxt() });
    }
  };
};

export function buildRobotsTxt(): string {
  const { companyWebsite } = readConstants();
  const website = toAbsoluteUrl(companyWebsite);

  return `User-agent: *
Allow: /

# AI search bots — welcome
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

# Block training-only crawlers
User-agent: CCBot
Disallow: /

Sitemap: ${website}/sitemap.xml
`;
}

export const dynamicSitemapPlugin = (): Plugin => {
  return {
    name: 'dynamic-sitemap',
    configureServer(server) {
      serveGenerated(server, '/sitemap.xml', 'application/xml; charset=utf-8', buildSitemapXml);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemapXml() });
    }
  };
};

export function buildSitemapXml(): string {
  const { companyWebsite } = readConstants();
  const website = toAbsoluteUrl(companyWebsite);
  const currentDate = new Date().toISOString().split('T')[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

export const dynamicManifestPlugin = (): Plugin => {
  return {
    name: 'dynamic-manifest',
    configureServer(server) {
      serveGenerated(server, '/manifest.json', 'application/manifest+json', buildManifestJson);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: buildManifestJson() });
    }
  };
};

export function buildManifestJson(): string {
  const { appName, tagline } = readConstants();

  return JSON.stringify(
    {
      short_name: appName,
      name: appName,
      description: tagline,
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ],
      start_url: '/app',
      display: 'standalone',
      theme_color: '#000000',
      background_color: '#ffffff'
    },
    null,
    2
  );
}

const MAX_PORT = 65535;
const CONSTANTS_MODULE = '/src/constants.json';

export type Env = Record<string, string | undefined>;

export function envPort(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`${name} must be a port number from 1 to ${MAX_PORT}, got "${raw}"`);
  }
  return port;
}

export function withDevBackendPort(constantsSource: string, backendPort: number): string {
  const parsed: unknown = JSON.parse(constantsSource);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('constants.json: expected an object');
  }
  return JSON.stringify({ ...parsed, devBackendURL: `http://localhost:${backendPort}/api` });
}

export const devBackendPortPlugin = (env: Env): Plugin => {
  return {
    name: 'dev-backend-port',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      if (!env.SKATEBOARD_BACKEND_PORT || !id.split('?')[0].endsWith(CONSTANTS_MODULE)) return null;
      return { code: withDevBackendPort(code, envPort(env, 'SKATEBOARD_BACKEND_PORT', 0)), map: null };
    }
  };
};
