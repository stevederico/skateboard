import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.js';
import { BACKEND_BOOT_TIMEOUT_MS, FRONTEND_URL, assertPortsFree, resetArtifacts, startServers, stopServers } from './servers.js';
import { ab, drainProblems, expectText, findRole, writeBrowserConfig } from './browser.js';

const constants = JSON.parse(readFileSync(path.join(REPO, 'src/constants.json'), 'utf8'));
const PAGE_URLS = (constants.pages ?? []).map((page) => page.url).filter(Boolean);
const SETUP_TIMEOUT_MS = BACKEND_BOOT_TIMEOUT_MS + 120_000;
const PAGE_TIMEOUT_MS = 60_000;

const ALLOWED_FAILED_REQUESTS = [
  { status: 404, url: /\/api\/signup\/options$/ },
  { status: 401, url: /\/api\/(me|signin)$/ },
];

const MAIN = { role: 'main' };

let servers = [];
const problems = [];

const goto = (route) => ab('open', `${FRONTEND_URL}${route}`);

function page(name, route, check) {
  it(name, { timeout: PAGE_TIMEOUT_MS }, async () => {
    await goto(route);
    await check();
  });
}

describe('smoke: every page loads without errors', () => {
  before(async () => {
    await assertPortsFree();
    resetArtifacts();
    writeBrowserConfig();
    servers = await startServers();
    await ab('open');
    await ab('set', 'viewport', '1280', '720');
  }, { timeout: SETUP_TIMEOUT_MS });

  afterEach(async () => {
    problems.push(...(await drainProblems(ALLOWED_FAILED_REQUESTS)));
  });

  after(async () => {
    try {
      await ab('close');
    } catch (error) {
      console.error(`agent-browser close failed: ${error.message}`);
    }
    stopServers(servers);
  });

  page('landing page renders', '/', () => findRole({ role: 'heading', level: 1 }));

  for (const url of [...PAGE_URLS, 'settings']) {
    page(`app page /app/${url} renders`, `/app/${url}`, () => findRole(MAIN));
  }

  page('terms page renders', '/terms', () => expectText(/terms/i));

  page('unknown route shows the 404 page', '/this-route-does-not-exist', () => expectText('404', { exact: true }));

  it('no uncaught exceptions, console errors or unexpected failed requests on any page', () => {
    assert.deepEqual(problems, []);
  });
});
