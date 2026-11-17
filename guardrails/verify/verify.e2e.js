import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, SCREENSHOTS } from './paths.js';
import { BACKEND_BOOT_TIMEOUT_MS, FRONTEND_URL, assertPortsFree, resetArtifacts, startServers, stopServers } from './servers.js';
import { ab, attribute, click, cookieHeader, drainProblems, expectGone, expectNoText, expectText, expectUrl, fill, findRole, labelledByText, writeBrowserConfig } from './browser.js';

const constants = JSON.parse(readFileSync(path.join(REPO, 'src/constants.json'), 'utf8'));
const PAGE_TITLES = constants.pages.map((item) => item.title);
const HOME_TITLE = PAGE_TITLES[0];

const BACKEND_API = constants.devBackendURL;
const USER = { name: 'Verify User', email: `verify-${Date.now()}@example.com`, password: 'verify-pass-1' };
const VIEWPORT = ['1280', '720'];
const SETUP_TIMEOUT_MS = BACKEND_BOOT_TIMEOUT_MS + 120_000;
const FLOW_TIMEOUT_MS = 90_000;

const ALLOWED_FAILED_REQUESTS = [
  { status: 404, url: /\/api\/signup\/options$/ },
  { status: 401, url: /\/api\/signin$/ },
];

const MAIN = { role: 'main' };
const BANNER = { role: 'banner' };
const FOOTER = { role: 'contentinfo' };
const authDialog = (mode) => ({ role: 'dialog', name: mode });
const button = (name) => ({ role: 'button', name });
const heading = (name, level) => ({ role: 'heading', name, level });

let servers = [];
let hasFailed = false;
const problems = [];

const goto = (route) => ab('open', `${FRONTEND_URL}${route}`);

const shot = (name) => ab('screenshot', '--full', path.join(SCREENSHOTS, `${name}.png`));

async function backendMe() {
  const response = await fetch(`${BACKEND_API}/me`, { headers: { cookie: await cookieHeader(new URL(BACKEND_API).hostname) } });
  return { status: response.status, body: response.ok ? await response.json() : null };
}

function flow(name, body) {
  it(name, { timeout: FLOW_TIMEOUT_MS }, async (t) => {
    if (hasFailed) return t.skip('an earlier flow failed; the flows share one browser session');
    try {
      await body();
    } catch (error) {
      hasFailed = true;
      throw error;
    }
  });
}

describe('runtime verify', () => {
  before(async () => {
    await assertPortsFree();
    resetArtifacts();
    writeBrowserConfig();
    servers = await startServers();
    await ab('open');
    await ab('set', 'viewport', ...VIEWPORT);
    await ab('set', 'media', 'light', 'reduced-motion');
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

  flow('landing page shows the product, features, pricing and legal links', async () => {
    await goto('/');
    await findRole(heading(constants.tagline, 1));
    await findRole({ role: 'link', name: constants.appName }, { within: BANNER });
    await findRole(heading(constants.features.title));
    await findRole(heading(constants.pricing.title));
    assert.equal(await attribute({ role: 'link', name: 'Terms' }, 'href', { within: FOOTER }), '/terms');
    await shot('01-landing');
  });

  flow('call to action opens the app for a guest, and settings asks them to sign in', async () => {
    await click(button(constants.cta), { within: BANNER });
    await expectUrl(/\/app\/home$/);
    await findRole(heading(HOME_TITLE, 1), { within: MAIN });
    await click(button('Settings'));
    await expectText('Sign in to access your account settings.', { within: MAIN });
    await shot('02-guest-settings');
  });

  flow('sign up creates an account and a backend session', async () => {
    await goto('/signup');
    const dialog = authDialog('Sign Up');
    await findRole(dialog);
    await fill({ role: 'textbox', name: 'Name' }, USER.name, { within: dialog });
    await fill({ role: 'textbox', name: 'Email' }, USER.email, { within: dialog });
    await fill({ role: 'textbox', name: 'Password' }, USER.password, { within: dialog });
    await shot('03-sign-up-form');
    await click(button('Sign Up'), { within: dialog });
    await expectGone(dialog);
    const me = await backendMe();
    assert.equal(me.status, 200, 'backend session cookie is set after sign up');
    assert.equal(me.body.email, USER.email);
    assert.equal(me.body.name, USER.name);
  });

  flow('main app view renders the dashboard and sidebar pages', async () => {
    await findRole(heading(HOME_TITLE, 1), { within: MAIN });
    await expectText('Total Revenue', { within: MAIN });
    for (const title of [...PAGE_TITLES, 'Settings']) await findRole(button(title));
    await shot('04-dashboard');
  });

  flow('sidebar navigates to a page with an empty state', async () => {
    await click(button('Analytics'));
    await expectUrl(/\/app\/analytics$/);
    await findRole(heading('Analytics', 1), { within: MAIN });
    await expectText('Analytics will appear here once you have activity.', { within: MAIN });
    await shot('05-analytics-empty-state');
  });

  flow('command menu opens with Ctrl+K and navigates', async () => {
    await ab('press', 'Control+k');
    const menu = { role: 'dialog' };
    await findRole({ role: 'combobox' }, { within: menu });
    assert.equal(await labelledByText(menu), 'Command Menu');
    await shot('06-command-menu');
    await click({ role: 'option', name: 'Projects' }, { within: menu });
    await expectUrl(/\/app\/projects$/);
    await findRole(heading('Projects', 1), { within: MAIN });
  });

  flow('settings shows the signed-in account, plan and version', async () => {
    await click(button('Settings'));
    await expectUrl(/\/app\/settings$/);
    await findRole(heading('Settings', 1), { within: MAIN });
    await expectText(USER.email, { within: MAIN });
    await expectText(USER.name, { within: MAIN, exact: true });
    await expectText('Free plan', { within: MAIN });
    await expectText(/^v\d+\.\d+\.\d+$/, { within: MAIN });
    await shot('07-settings');
  });

  flow('sign out asks for confirmation and ends the session', async () => {
    await click(button('Sign Out'), { within: MAIN });
    const confirm = { role: 'alertdialog' };
    await expectText('Are you sure you want to sign out?', { within: confirm });
    await shot('08-sign-out-confirm');
    await click(button('Sign Out'), { within: confirm });
    await expectUrl(/:5173\/$/);
    await findRole(heading(constants.tagline, 1));
    const me = await backendMe();
    assert.equal(me.status, 401, 'backend rejects the session after sign out');
    await shot('09-signed-out');
  });

  flow('sign in rejects a wrong password, then restores the account', async () => {
    await goto('/signin');
    const dialog = authDialog('Sign In');
    await findRole(dialog);
    await fill({ role: 'textbox', name: 'Email' }, USER.email, { within: dialog });
    await fill({ role: 'textbox', name: 'Password' }, 'wrong-password', { within: dialog });
    await click(button('Sign In'), { within: dialog });
    await findRole({ role: 'alert' }, { within: dialog });
    await shot('10-sign-in-error');
    await fill({ role: 'textbox', name: 'Password' }, USER.password, { within: dialog });
    await click(button('Sign In'), { within: dialog });
    await expectGone(dialog);
    await click(button('Settings'));
    await expectText(USER.email, { within: MAIN });
    await shot('11-signed-in');
  });

  flow('legal page renders the terms with the company name filled in', async () => {
    await goto('/terms');
    await expectText(`Welcome to the ${constants.companyName} Application.`);
    await expectNoText(/_COMPANY_|_WEBSITE_|_EMAIL_/);
    await shot('12-terms');
  });

  flow('unknown route shows the 404 page', async () => {
    await goto('/this-route-does-not-exist');
    await expectText('404', { exact: true });
    await expectText('Page not found.');
    await shot('13-not-found');
  });

  it('no uncaught exceptions, console errors or unexpected failed requests during the flows', () => {
    assert.deepEqual(problems, []);
  });
});
