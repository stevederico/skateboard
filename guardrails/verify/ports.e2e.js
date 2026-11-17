import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import path from 'node:path';
import { ARTIFACTS } from './paths.js';

const PORTS_BACKEND_STATE = path.join(ARTIFACTS, 'ports-backend-state');
const SETUP_TIMEOUT_MS = 420_000;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, 'localhost', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function twoFreePorts() {
  const first = await freePort();
  let second = await freePort();
  while (second === first) second = await freePort();
  return [first, second];
}

describe('verify on non-default ports', () => {
  let servers = [];
  let ports;
  let verifyServers;

  before(async () => {
    const [frontendPort, backendPort] = await twoFreePorts();
    ports = { frontendPort, backendPort };
    process.env.SKATEBOARD_FRONTEND_PORT = String(frontendPort);
    process.env.SKATEBOARD_BACKEND_PORT = String(backendPort);
    verifyServers = await import('./servers.js');
    await verifyServers.assertPortsFree();
    verifyServers.resetArtifacts(PORTS_BACKEND_STATE);
    servers = await verifyServers.startServers(PORTS_BACKEND_STATE);
  }, { timeout: SETUP_TIMEOUT_MS });

  after(() => {
    verifyServers?.stopServers(servers);
  });

  it('reads both ports from the environment', () => {
    assert.equal(verifyServers.FRONTEND_PORT, ports.frontendPort);
    assert.equal(verifyServers.BACKEND_PORT, ports.backendPort);
    assert.notEqual(ports.frontendPort, 5173);
    assert.notEqual(ports.backendPort, 8000);
  });

  it('serves the frontend on SKATEBOARD_FRONTEND_PORT', async () => {
    const response = await fetch(`http://localhost:${ports.frontendPort}/`);
    assert.equal(response.status, 200);
  });

  it('serves the backend on SKATEBOARD_BACKEND_PORT', async () => {
    const response = await fetch(`http://localhost:${ports.backendPort}/api/health`);
    assert.equal(response.status, 200);
  });

  it('points the dev frontend at the backend port', async () => {
    const source = await (await fetch(`http://localhost:${ports.frontendPort}/src/constants.json?import`)).text();
    assert.ok(source.includes(`http://localhost:${ports.backendPort}/api`), source.slice(0, 400));
  });

  it('lets the backend accept requests from the frontend origin', async () => {
    const origin = `http://localhost:${ports.frontendPort}`;
    const response = await fetch(`http://localhost:${ports.backendPort}/api/health`, { headers: { origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  });
});
