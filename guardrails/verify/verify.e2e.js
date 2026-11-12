/**
 * Runtime verification: clicks through the main flows of the running app (real Vite
 * frontend + real Rust backend, see playwright.config.js) and saves a full-page
 * screenshot of each step to verify-artifacts/screenshots/.
 *
 * Flows: landing, guest entry, sign up, main app view, sidebar navigation, command menu, settings,
 * sign out, sign in, legal page, 404. Run with `npm run verify`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { REPO, SCREENSHOTS } from './paths.js';

/**
 * App config, read with fs: guardrails/ may not import src/ (see layers.js), and reading
 * it keeps the flows in step with the app's own names. View content asserted below
 * ("Total Revenue", the Analytics empty state) is the template's; an app that replaces
 * those views edits the matching assertions.
 */
const constants = JSON.parse(readFileSync(path.join(REPO, 'src/constants.json'), 'utf8'));
const PAGE_TITLES = constants.pages.map((/** @type {{ title: string }} */ item) => item.title);
const HOME_TITLE = PAGE_TITLES[0];

/** Same origin the browser uses in dev (src/constants.json `devBackendURL`). */
const BACKEND_API = constants.devBackendURL;
const USER = { name: 'Verify User', email: `verify-${Date.now()}@example.com`, password: 'verify-pass-1' };

/**
 * Console errors the template is known to produce, with the reason each is tolerated.
 * Anything else fails the run.
 */
const ALLOWED_CONSOLE_ERRORS = [
  // skateboard-ui probes GET /api/signup/options for an optional Turnstile site key; the
  // template backend does not serve it and the sign-up form treats 404 as "no widget".
  { pattern: /status of 404/, location: /\/api\/signup\/options$/ },
  // The sign-in flow submits a wrong password on purpose; the browser logs the 401.
  { pattern: /status of 401/, location: /\/api\/signin$/ },
];

test.describe.configure({ mode: 'serial' });

/** @type {import('@playwright/test').Page} */
let page;
/** @type {string[]} Uncaught exceptions and unexpected console errors seen on the page. */
const problems = [];

/**
 * Save a full-page screenshot as verify-artifacts/screenshots/<name>.png.
 *
 * @param {string} name - File name without extension, e.g. `01-landing`
 * @returns {Promise<void>}
 */
async function shot(name) {
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true, animations: 'disabled' });
}

/**
 * The auth overlay dialog (sign up / sign in) rendered by skateboard-ui.
 *
 * @param {'Sign Up' | 'Sign In'} mode - Dialog title
 * @returns {import('@playwright/test').Locator} Dialog locator
 */
const authDialog = (mode) => page.getByRole('dialog', { name: mode });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    const { url } = message.location();
    if (ALLOWED_CONSOLE_ERRORS.some((allowed) => allowed.pattern.test(text) && allowed.location.test(url))) return;
    problems.push(`console error: ${text} (${url})`);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('landing page shows the product, features, pricing and legal links', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: constants.tagline })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: constants.appName })).toBeVisible();
  await expect(page.getByRole('heading', { name: constants.features.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: constants.pricing.title })).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  await shot('01-landing');
});

test('call to action opens the app for a guest, and settings asks them to sign in', async () => {
  await page.getByRole('banner').getByRole('button', { name: constants.cta }).click();
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: HOME_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('main').getByText('Sign in to access your account settings.')).toBeVisible();
  await shot('02-guest-settings');
});

test('sign up creates an account and a backend session', async () => {
  await page.goto('/signup');
  const dialog = authDialog('Sign Up');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill(USER.name);
  await dialog.getByLabel('Email').fill(USER.email);
  await dialog.getByLabel('Password').fill(USER.password);
  await shot('03-sign-up-form');
  await dialog.getByRole('button', { name: 'Sign Up' }).click();
  await expect(dialog).toBeHidden();
  const me = await page.request.get(`${BACKEND_API}/me`);
  expect(me.status(), 'backend session cookie is set after sign up').toBe(200);
  expect(await me.json()).toMatchObject({ email: USER.email, name: USER.name });
});

test('main app view renders the dashboard and sidebar pages', async () => {
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: HOME_TITLE })).toBeVisible();
  await expect(page.getByRole('main').getByText('Total Revenue')).toBeVisible();
  for (const title of [...PAGE_TITLES, 'Settings']) {
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }
  await shot('04-dashboard');
});

test('sidebar navigates to a page with an empty state', async () => {
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/analytics$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Analytics will appear here once you have activity.')).toBeVisible();
  await shot('05-analytics-empty-state');
});

test('command menu opens with Ctrl+K and navigates', async () => {
  await page.keyboard.press('Control+k');
  const menu = page.getByRole('dialog', { name: 'Command Menu' });
  await expect(menu.getByRole('combobox')).toBeVisible();
  await shot('06-command-menu');
  await menu.getByRole('option', { name: 'Projects' }).click();
  await expect(page).toHaveURL(/\/app\/projects$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
});

test('settings shows the signed-in account, plan and version', async () => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(main.getByText(USER.email)).toBeVisible();
  await expect(main.getByText(USER.name, { exact: true })).toBeVisible();
  await expect(main.getByText('Free plan')).toBeVisible();
  await expect(main.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await shot('07-settings');
});

test('sign out asks for confirmation and ends the session', async () => {
  await page.getByRole('main').getByRole('button', { name: 'Sign Out' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Are you sure you want to sign out?')).toBeVisible();
  await shot('08-sign-out-confirm');
  await confirm.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: constants.tagline })).toBeVisible();
  const me = await page.request.get(`${BACKEND_API}/me`);
  expect(me.status(), 'backend rejects the session after sign out').toBe(401);
  await shot('09-signed-out');
});

test('sign in rejects a wrong password, then restores the account', async () => {
  await page.goto('/signin');
  const dialog = authDialog('Sign In');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Email').fill(USER.email);
  await dialog.getByLabel('Password').fill('wrong-password');
  await dialog.getByRole('button', { name: 'Sign In' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await shot('10-sign-in-error');
  await dialog.getByLabel('Password').fill(USER.password);
  await dialog.getByRole('button', { name: 'Sign In' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('main').getByText(USER.email)).toBeVisible();
  await shot('11-signed-in');
});

test('legal page renders the terms with the company name filled in', async () => {
  await page.goto('/terms');
  await expect(page.getByText(`Welcome to the ${constants.companyName} Application.`)).toBeVisible();
  await expect(page.getByText(/_COMPANY_|_WEBSITE_|_EMAIL_/)).toHaveCount(0);
  await shot('12-terms');
});

test('unknown route shows the 404 page', async () => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByText('404', { exact: true })).toBeVisible();
  await expect(page.getByText('Page not found.')).toBeVisible();
  await shot('13-not-found');
});

test('no uncaught exceptions or unexpected console errors during the flows', async () => {
  expect(problems).toEqual([]);
});
