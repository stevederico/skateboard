import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ARTIFACTS } from './paths.js';

const AGENT_BROWSER = process.env.AGENT_BROWSER ?? 'agent-browser';
const CONFIG = path.join(ARTIFACTS, 'agent-browser.json');
const SESSION = `skateboard-verify-${process.pid}`;
const MAX_OUTPUT = 64 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 60_000;
const WAIT_TIMEOUT_MS = 15_000;
const POLL_MS = 150;
const SNAPSHOT_LINE = /^(\s*)- (\S+)(?: "((?:[^"\\]|\\.)*)")?(?: \[([^\]]*)\])?/;
const AGENT_BROWSER_MISSING =
  'agent-browser is not on PATH. Install it once with `mise use -g npm:agent-browser` (or `npm install -g agent-browser`), or point AGENT_BROWSER at the binary. It drives a local Chrome or Chromium; set AGENT_BROWSER_EXECUTABLE_PATH if it cannot find one.';

export function writeBrowserConfig() {
  writeFileSync(CONFIG, `${JSON.stringify({ headed: false }, null, 2)}\n`);
}

export function ab(...args) {
  return new Promise((resolve, reject) => {
    const argv = ['--config', CONFIG, '--session', SESSION, '--json', ...args];
    execFile(AGENT_BROWSER, argv, { maxBuffer: MAX_OUTPUT, timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') return reject(new Error(AGENT_BROWSER_MISSING));
      let reply;
      try {
        reply = JSON.parse(stdout);
      } catch {
        return reject(new Error(`agent-browser ${args.join(' ')} printed no JSON (exit ${error?.code ?? 0}): ${stderr || stdout}`));
      }
      if (!reply.success) return reject(new Error(`agent-browser ${args.join(' ')}: ${reply.error}`));
      resolve(reply.data);
    });
  });
}

const unquote = (raw) => {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
};

export function parseSnapshot(text) {
  const root = { role: 'root', name: '', children: [] };
  const stack = [{ node: root, indent: -1 }];
  for (const line of text.split('\n')) {
    const match = SNAPSHOT_LINE.exec(line);
    if (!match) continue;
    const [, spaces, role, name, attrs = ''] = match;
    const level = /\blevel=(\d+)/.exec(attrs)?.[1];
    const node = {
      role,
      name: name === undefined ? '' : unquote(name),
      level: level ? Number(level) : undefined,
      ref: /\bref=(e\d+)/.exec(attrs)?.[1],
      children: [],
    };
    while (stack.at(-1).indent >= spaces.length) stack.pop();
    stack.at(-1).node.children.push(node);
    stack.push({ node, indent: spaces.length });
  }
  return root;
}

function nameMatches(actual, expected, exact) {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(actual);
  return exact ? actual === expected : actual.toLowerCase().includes(expected.toLowerCase());
}

function matches(node, { role, name, level, exact = true }) {
  return node.role === role && nameMatches(node.name, name, exact) && (level === undefined || node.level === level);
}

function* walk(node) {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

function findAll(root, query) {
  return [...walk(root)].filter((node) => matches(node, query));
}

function scopeOf(root, within) {
  if (!within) return [root];
  return findAll(root, within);
}

const describeQuery = ({ role, name, level }, within) =>
  `${role}${name === undefined ? '' : ` named ${name}`}${level ? ` (level ${level})` : ''}${within ? ` inside ${describeQuery(within)}` : ''}`;

async function poll(check, describeFailure, timeout = WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(await describeFailure());
    await sleep(POLL_MS);
  }
}

export async function snapshot() {
  return parseSnapshot((await ab('snapshot')).snapshot);
}

const lastTree = async () => (await ab('snapshot')).snapshot;

export async function findRole(query, { within, timeout } = {}) {
  return poll(
    async () => scopeOf(await snapshot(), within).flatMap((scope) => findAll(scope, query))[0],
    async () => `expected a visible ${describeQuery(query, within)}; the page shows:\n${await lastTree()}`,
    timeout,
  );
}

export async function expectGone(query, { within } = {}) {
  await poll(
    async () => scopeOf(await snapshot(), within).flatMap((scope) => findAll(scope, query)).length === 0,
    async () => `expected no ${describeQuery(query, within)}; the page shows:\n${await lastTree()}`,
  );
}

function textNodes(root) {
  return [...walk(root)].filter((node) => node.name !== '').map((node) => node.name);
}

const textMatches = (texts, text, exact) =>
  texts.some((value) => (text instanceof RegExp ? text.test(value) : nameMatches(value, text, exact)));

export async function expectText(text, { within, exact = false } = {}) {
  await poll(
    async () => textMatches(scopeOf(await snapshot(), within).flatMap(textNodes), text, exact),
    async () => `expected the text ${text}${within ? ` inside ${describeQuery(within)}` : ''}; the page shows:\n${await lastTree()}`,
  );
}

export async function expectNoText(pattern) {
  const texts = textNodes(await snapshot());
  const found = texts.filter((value) => pattern.test(value));
  if (found.length > 0) throw new Error(`expected no text matching ${pattern}, found: ${found.join(' | ')}`);
}

export async function click(query, options) {
  const node = await findRole(query, options);
  await ab('click', `@${node.ref}`);
}

export async function fill(query, value, options) {
  const node = await findRole(query, options);
  await ab('fill', `@${node.ref}`, '--', value);
}

export async function attribute(query, name, options) {
  const node = await findRole(query, options);
  return (await ab('get', 'attr', `@${node.ref}`, name)).value;
}

export async function labelledByText(query, options) {
  const id = await attribute(query, 'aria-labelledby', options);
  if (!id) return '';
  const { result } = await ab('eval', `document.getElementById(${JSON.stringify(id)})?.textContent ?? ''`);
  return result;
}

export async function expectUrl(pattern) {
  let url = '';
  await poll(
    async () => {
      url = (await ab('get', 'url')).url;
      return pattern.test(url);
    },
    () => `expected the URL to match ${pattern}, it is ${url}`,
  );
}

export async function cookieHeader(host) {
  const { cookies } = await ab('cookies');
  return cookies
    .filter((cookie) => cookie.domain.replace(/^\./, '') === host)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export async function drainProblems(allowedFailures) {
  const [{ messages }, { errors }, { requests }] = await Promise.all([ab('console'), ab('errors'), ab('network', 'requests')]);
  await Promise.all([ab('console', '--clear'), ab('errors', '--clear'), ab('network', 'requests', '--clear')]);
  const isAllowed = (request) => allowedFailures.some((allowed) => allowed.status === request.status && allowed.url.test(request.url));
  return [
    ...errors.map((error) => `uncaught exception: ${error.text}`),
    ...messages.filter((message) => message.type === 'error').map((message) => `console error: ${message.text}`),
    ...requests.filter((request) => request.status >= 400 && !isAllowed(request)).map((request) => `failed request: ${request.status} ${request.method} ${request.url}`),
  ];
}
