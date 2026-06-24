import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setConstantsReaderForTests,
  customLoggerPlugin,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin
} from './vite.plugins.ts';

const constantsWithoutHttp = {
  appName: 'Test App',
  tagline: 'Try Something New',
  companyWebsite: 'company.com'
};

const constantsWithHttp = {
  ...constantsWithoutHttp,
  companyWebsite: 'https://example.com'
};

let constantsMode = 'without-http';

// Inject the constants source instead of mocking node:fs — the reader closes over the
// live `constantsMode`, so flipping it in beforeEach/it switches the fixture.
__setConstantsReaderForTests(() =>
  JSON.stringify(constantsMode === 'with-http' ? constantsWithHttp : constantsWithoutHttp)
);

describe('customLoggerPlugin', () => {
  it('overrides printUrls with a single localhost message', () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const plugin = customLoggerPlugin();
      const server = { config: { server: { port: 3000 } }, printUrls: null };
      plugin.configureServer(server);
      server.printUrls();

      assert.equal(logs[0], 'React is running on http://localhost:3000');
    } finally {
      console.log = originalLog;
    }
  });

  it('falls back to port 5173 when server port is unset', () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const plugin = customLoggerPlugin();
      const server = { config: { server: {} }, printUrls: null };
      plugin.configureServer(server);
      server.printUrls();

      assert.equal(logs[0], 'React is running on http://localhost:5173');
    } finally {
      console.log = originalLog;
    }
  });
});

describe('htmlReplacePlugin', () => {
  beforeEach(() => {
    constantsMode = 'without-http';
  });

  it('replaces template placeholders from constants.json', () => {
    const plugin = htmlReplacePlugin();
    const html = '<title>{{APP_NAME}}</title><meta name="description" content="{{TAGLINE}}"><link href="{{COMPANY_WEBSITE}}">';

    const result = plugin.transformIndexHtml(html);

    assert.match(result, /Test App/);
    assert.match(result, /Try Something New/);
    assert.match(result, /company\.com/);
  });
});

describe('dynamicRobotsPlugin', () => {
  beforeEach(() => {
    constantsMode = 'without-http';
  });

  it('emits robots.txt with https prefix when website has no http', () => {
    const emitted = [];
    const plugin = dynamicRobotsPlugin();

    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].fileName, 'robots.txt');
    assert.match(emitted[0].source, /Sitemap: https:\/\/company\.com\/sitemap\.xml/);
  });

  it('emits robots.txt preserving http website URL', () => {
    constantsMode = 'with-http';
    const emitted = [];
    const plugin = dynamicRobotsPlugin();

    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });

    assert.match(emitted[0].source, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
  });
});

describe('dynamicSitemapPlugin', () => {
  beforeEach(() => {
    constantsMode = 'without-http';
  });

  it('emits sitemap.xml with https prefix when website has no http', () => {
    const emitted = [];
    const plugin = dynamicSitemapPlugin();
    const currentDate = new Date().toISOString().split('T')[0];

    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });

    assert.equal(emitted[0].fileName, 'sitemap.xml');
    assert.match(emitted[0].source, /<loc>https:\/\/company\.com\/<\/loc>/);
    assert.match(emitted[0].source, new RegExp(`<lastmod>${currentDate}</lastmod>`));
  });

  it('emits sitemap.xml preserving http website URL', () => {
    constantsMode = 'with-http';
    const emitted = [];
    const plugin = dynamicSitemapPlugin();

    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });

    assert.match(emitted[0].source, /<loc>https:\/\/example\.com\/<\/loc>/);
    assert.match(emitted[0].source, /<loc>https:\/\/example\.com\/terms<\/loc>/);
  });
});

describe('dynamicManifestPlugin', () => {
  beforeEach(() => {
    constantsMode = 'without-http';
  });

  it('emits manifest.json from constants.json', () => {
    const emitted = [];
    const plugin = dynamicManifestPlugin();

    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });

    assert.equal(emitted[0].fileName, 'manifest.json');
    const manifest = JSON.parse(emitted[0].source);
    assert.equal(manifest.short_name, 'Test App');
    assert.equal(manifest.name, 'Test App');
    assert.equal(manifest.description, 'Try Something New');
    assert.equal(manifest.start_url, './app');
    assert.equal(manifest.display, 'standalone');
  });
});