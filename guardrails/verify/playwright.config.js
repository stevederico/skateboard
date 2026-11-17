import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ARTIFACTS, BACKEND_STATE, REPO, SCREENSHOTS } from './paths.js';

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_PORT = 8000;
const BACKEND_BOOT_TIMEOUT_MS = 300_000;
const FRONTEND_BOOT_TIMEOUT_MS = 60_000;

// Workers re-import this file; only the runner process (no TEST_WORKER_INDEX) may reset
// state, or a worker would delete the database the running backend has open.
if (process.env.TEST_WORKER_INDEX === undefined) {
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

export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.js',
  outputDir: path.join(ARTIFACTS, 'playwright'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'backend',
      command: 'cargo run --manifest-path backend/Cargo.toml --locked',
      cwd: REPO,
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      timeout: BACKEND_BOOT_TIMEOUT_MS,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        SKATEBOARD_BACKEND_DIR: BACKEND_STATE,
        JWT_SECRET: randomBytes(32).toString('hex'),
        NODE_ENV: 'development',
        PORT: String(BACKEND_PORT),
      },
    },
    {
      name: 'frontend',
      command: 'node node_modules/vite/bin/vite.js --mode development --port 5173 --strictPort',
      cwd: REPO,
      url: FRONTEND_URL,
      timeout: FRONTEND_BOOT_TIMEOUT_MS,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
