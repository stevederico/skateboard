import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setConstantsReaderForTests,
  customLoggerPlugin,
  htmlReplacePlugin,
  dynamicRobotsPlugin,
  dynamicSitemapPlugin,
  dynamicManifestPlugin,
  devBackendPortPlugin,
  envPort,
  withDevBackendPort
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
    assert.equal(manifest.start_url, '/app');
    assert.deepEqual(manifest.icons, [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]);
    assert.equal(manifest.display, 'standalone');
  });
});

describe('dev server generated files', () => {
  beforeEach(() => {
    constantsMode = 'without-http';
  });

  function callDevMiddleware(plugin) {
    let registered = null;
    plugin.configureServer({
      middlewares: {
        use(route, handler) {
          registered = { route, handler };
        }
      }
    });

    const headers = {};
    let body = '';
    registered.handler(
      {},
      {
        setHeader(name, value) {
          headers[name] = value;
        },
        end(chunk) {
          body = chunk;
        }
      }
    );

    return { route: registered.route, contentType: headers['Content-Type'], body };
  }

  it('serves robots.txt matching the built asset', () => {
    const dev = callDevMiddleware(dynamicRobotsPlugin());
    const built = [];
    dynamicRobotsPlugin().generateBundle.call({ emitFile: (file) => built.push(file) });

    assert.equal(dev.route, '/robots.txt');
    assert.equal(dev.body, built[0].source);
  });

  it('serves sitemap.xml as XML', () => {
    const dev = callDevMiddleware(dynamicSitemapPlugin());

    assert.equal(dev.route, '/sitemap.xml');
    assert.equal(dev.contentType, 'application/xml; charset=utf-8');
  });

  it('serves manifest.json as a web app manifest', () => {
    const dev = callDevMiddleware(dynamicManifestPlugin());

    assert.equal(dev.route, '/manifest.json');
    assert.equal(dev.contentType, 'application/manifest+json');
    assert.equal(JSON.parse(dev.body).start_url, '/app');
  });
});
describe('vite.config.ts', () => {
  const serveConfig = async (env = {}) => {
    const { skateboardViteConfig } = await import('./vite.config.ts');
    return skateboardViteConfig({ env });
  };

  it('leaves HMR at its default so the client follows a 5173 to 5174 port fallback', async () => {
    const config = await serveConfig();
    assert.equal(config.server.hmr, undefined);
    assert.equal(config.server.port, 5173);
    assert.equal(config.server.strictPort, false);
  });

  it('serves on SKATEBOARD_FRONTEND_PORT strictly, so the backend CORS list matches it', async () => {
    const config = await serveConfig({ SKATEBOARD_FRONTEND_PORT: '5273' });
    assert.equal(config.server.port, 5273);
    assert.equal(config.server.strictPort, true);
  });

  it('loads the dev backend port plugin with the same env', async () => {
    const config = await serveConfig({ SKATEBOARD_BACKEND_PORT: '8100' });
    const plugin = config.plugins.find((p) => p.name === 'dev-backend-port');
    assert.equal(plugin.transform('{"devBackendURL":"x"}', '/app/src/constants.json').code, '{"devBackendURL":"http://localhost:8100/api"}');
  });

  it('dedupes react and react-dom only, since react-router is vendored inside skateboard-ui', async () => {
    const config = await serveConfig();
    assert.deepEqual(config.resolve.dedupe, ['react', 'react-dom']);
    const prebundled = config.optimizeDeps.include.join(' ');
    assert.ok(!prebundled.includes('react-router'), prebundled);
  });
});

describe('devBackendPortPlugin', () => {
  const CONSTANTS = JSON.stringify({ appName: 'A', backendURL: '/api', devBackendURL: 'http://localhost:8000/api' });

  it('runs in the dev server only, before the JSON plugin', () => {
    const plugin = devBackendPortPlugin({});
    assert.equal(plugin.apply, 'serve');
    assert.equal(plugin.enforce, 'pre');
  });

  it('points devBackendURL at SKATEBOARD_BACKEND_PORT and keeps the other constants', () => {
    const result = devBackendPortPlugin({ SKATEBOARD_BACKEND_PORT: '8100' }).transform(CONSTANTS, '/app/src/constants.json');
    assert.deepEqual(JSON.parse(result.code), { appName: 'A', backendURL: '/api', devBackendURL: 'http://localhost:8100/api' });
  });

  it('leaves constants alone without the variable, and other JSON files always', () => {
    assert.equal(devBackendPortPlugin({}).transform(CONSTANTS, '/app/src/constants.json'), null);
    assert.equal(devBackendPortPlugin({ SKATEBOARD_BACKEND_PORT: '8100' }).transform('{}', '/app/src/legal.json'), null);
  });

  it('rejects constants that are not an object', () => {
    assert.throws(() => withDevBackendPort('[]', 8100), /expected an object/);
  });

  it('rejects a port that is not a number from 1 to 65535', () => {
    for (const bad of ['abc', '0', '70000', '51.5']) {
      assert.throws(() => envPort({ PORT_UNDER_TEST: bad }, 'PORT_UNDER_TEST', 1), /PORT_UNDER_TEST must be a port number from 1 to 65535/);
    }
  });
});
