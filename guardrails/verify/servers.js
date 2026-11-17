import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { BACKEND_STATE, REPO, SCREENSHOTS } from './paths.js';

export const FRONTEND_PORT = 5173;
export const BACKEND_PORT = 8000;
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;
export const BACKEND_BOOT_TIMEOUT_MS = 300_000;
const FRONTEND_BOOT_TIMEOUT_MS = 60_000;
const POLL_MS = 250;
const STDERR_TAIL = 4000;

export function resetArtifacts() {
  rmSync(BACKEND_STATE, { recursive: true, force: true });
  rmSync(SCREENSHOTS, { recursive: true, force: true });
  mkdirSync(BACKEND_STATE, { recursive: true });
  mkdirSync(SCREENSHOTS, { recursive: true });
  writeFileSync(
    path.join(BACKEND_STATE, 'config.json'),
    JSON.stringify({
      staticDir: path.join(REPO, 'dist'),
      database: { db: 'Verify', dbType: 'sqlite', connectionString: './databases/verify.db' },
    }),
  );
}

function isPortTaken(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

export async function assertPortsFree() {
  for (const port of [FRONTEND_PORT, BACKEND_PORT]) {
    if (await isPortTaken(port)) {
      throw new Error(`port ${port} is already in use. npm run verify boots its own frontend (:${FRONTEND_PORT}) and backend (:${BACKEND_PORT}) against a throwaway database; stop the running dev server first.`);
    }
  }
}

function start(name, command, args, env = {}) {
  const child = spawn(command, args, { cwd: REPO, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const server = { name, child, stderr: '', exited: null };
  child.stderr.on('data', (chunk) => {
    server.stderr = (server.stderr + chunk).slice(-STDERR_TAIL);
  });
  child.on('exit', (code, signal) => {
    server.exited = signal ?? code;
  });
  child.on('error', (error) => {
    server.exited = error.message;
  });
  return server;
}

async function answers(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitUntilUp(server, url, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (server.exited !== null) throw new Error(`${server.name} exited (${server.exited}) before ${url} answered:\n${server.stderr}`);
    if (await answers(url)) return;
    await sleep(POLL_MS);
  }
  throw new Error(`${server.name} did not answer ${url} within ${timeout / 1000}s:\n${server.stderr}`);
}

export async function startServers() {
  const backend = start('backend', 'cargo', ['run', '--manifest-path', 'backend/Cargo.toml', '--locked'], {
    SKATEBOARD_BACKEND_DIR: BACKEND_STATE,
    JWT_SECRET: randomBytes(32).toString('hex'),
    NODE_ENV: 'development',
    PORT: String(BACKEND_PORT),
  });
  const frontend = start('frontend', process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'development', '--port', String(FRONTEND_PORT), '--strictPort']);
  const servers = [backend, frontend];
  try {
    await Promise.all([waitUntilUp(backend, BACKEND_HEALTH_URL, BACKEND_BOOT_TIMEOUT_MS), waitUntilUp(frontend, FRONTEND_URL, FRONTEND_BOOT_TIMEOUT_MS)]);
  } catch (error) {
    stopServers(servers);
    throw error;
  }
  return servers;
}

export function stopServers(servers) {
  for (const { child } of servers) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(`could not stop pid ${child.pid}: ${error.message}`);
    }
  }
}
