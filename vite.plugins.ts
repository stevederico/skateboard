import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Shape of the fields read from src/constants.json by these plugins.
 */
interface AppConstants {
  appName: string;
  tagline: string;
  companyWebsite: string;
}

/** Sources the raw constants.json text. Overridable in tests via {@link __setConstantsReaderForTests}. */
let constantsReader: () => string = () => readFileSync('src/constants.json', 'utf8');

/**
 * Test-only seam: override how {@link readConstants} sources its raw JSON, so tests
 * don't have to mock the `node:fs` builtin (whose named/default exports don't survive
 * `--experimental-test-module-mocks` reliably across Node versions).
 *
 * @param reader - Returns the raw constants.json string
 */
export function __setConstantsReaderForTests(reader: () => string): void {
  constantsReader = reader;
}

/**
 * Read and validate src/constants.json at the filesystem boundary.
 *
 * @returns Parsed app constants
 * @throws If constants.json is missing required string fields
 */
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

/**
 * Normalize a website value to an absolute https URL when no scheme is present.
 *
 * @param website - Raw companyWebsite value from constants.json
 * @returns Fully-qualified URL
 */
function toAbsoluteUrl(website: string): string {
  return website.startsWith('http') ? website : `https://${website}`;
}

/**
 * Custom logger plugin to simplify Vite server startup output
 *
 * Overrides default Vite URL printer to show single clean message.
 * Suppresses verbose network address output.
 *
 * @returns Vite plugin object
 */
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

/**
 * HTML template variable replacement plugin
 *
 * Replaces {{APP_NAME}}, {{TAGLINE}}, {{COMPANY_WEBSITE}} placeholders
 * in index.html with values from constants.json at build time. Enables
 * dynamic metadata without build script complexity.
 *
 * @returns Vite plugin object
 */
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

/**
 * Dynamic robots.txt generation plugin
 *
 * Generates robots.txt at build time with:
 * - Bot-specific rules (Googlebot, Bingbot, Applebot, social crawlers)
 * - Protected routes (/app/, /console/, /signin/, /signup/)
 * - Sitemap reference from constants.json
 * - Disallows all other bots from entire site
 *
 * @returns Vite plugin object
 */
export const dynamicRobotsPlugin = (): Plugin => {
  return {
    name: 'dynamic-robots',
    generateBundle() {
      const constants = readConstants();
      const website = toAbsoluteUrl(constants.companyWebsite);

      const robotsContent = `User-agent: *
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

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsContent
      });
    }
  };
};

/**
 * Dynamic sitemap.xml generation plugin
 *
 * Generates sitemap.xml at build time with static pages:
 * - / (priority 1.0, weekly)
 * - /terms (priority 0.8, monthly)
 * - /privacy (priority 0.8, monthly)
 * - /subs (priority 0.7, monthly)
 * - /eula (priority 0.7, monthly)
 *
 * Uses current build date for lastmod. Reads website URL from constants.json.
 *
 * @returns Vite plugin object
 */
export const dynamicSitemapPlugin = (): Plugin => {
  return {
    name: 'dynamic-sitemap',
    generateBundle() {
      const constants = readConstants();
      const website = toAbsoluteUrl(constants.companyWebsite);

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

/**
 * Dynamic PWA manifest.json generation plugin
 *
 * Generates Web App Manifest at build time with:
 * - App name and description from constants.json
 * - Icon configuration (192x192 SVG)
 * - Standalone display mode
 * - Start URL pointing to /app
 * - Black theme color, white background
 *
 * Enables Add to Home Screen and PWA functionality.
 *
 * @returns Vite plugin object
 */
export const dynamicManifestPlugin = (): Plugin => {
  return {
    name: 'dynamic-manifest',
    generateBundle() {
      const constants = readConstants();

      const manifestContent = {
        short_name: constants.appName,
        name: constants.appName,
        description: constants.tagline,
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ],
        start_url: './app',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#ffffff'
      };

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifestContent, null, 2)
      });
    }
  };
};
