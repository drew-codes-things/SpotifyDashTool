const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const BACKEND_ENTRY = path.join(__dirname, '..', 'index.js');
const FAKE_MCP_SERVER = path.join(__dirname, 'fixtures', 'fake-mcp-server.js');
const STARTUP_TIMEOUT_MS = 10000;
const STALLED_TOKEN = 'stalled-token';

const SPOTIFY_USERS_BY_TOKEN = {
  'good-token': 'mcp-account',
  'other-account-token': 'someone-else',
};

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spotifydash-test-'));
}

function writeStandInUv(script) {
  const dir = makeTempDir();
  const uvPath = path.join(dir, 'uv');
  fs.writeFileSync(uvPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return dir;
}

function standInUvRunningFakeServer() {
  return writeStandInUv(`exec "${process.execPath}" "${FAKE_MCP_SERVER}"`);
}

async function startFakeSpotify() {
  const meRequests = [];
  const server = http.createServer((req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (token === STALLED_TOKEN) return;
    if (req.url !== '/v1/me') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { status: 404, message: 'Not found' } }));
    }
    meRequests.push(token);
    const userId = SPOTIFY_USERS_BY_TOKEN[token];
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { status: 401, message: 'Invalid access token' } }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: userId }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    apiBase: `http://127.0.0.1:${server.address().port}/v1`,
    meRequests,
    close: () => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    }),
  };
}

async function findFreePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function startBackend({ uvDir, spotifyApiBase, extraEnv = {} }) {
  const port = await findFreePort();
  const child = spawn(process.execPath, [BACKEND_ENTRY], {
    env: {
      ...process.env,
      PATH: uvDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      SPOTIFY_API_BASE: spotifyApiBase,
      SPOTIFY_CLIENT_ID: 'test-client',
      SPOTIFY_CLIENT_SECRET: 'test-secret',
      BACKEND_REDIRECT_URI: `http://127.0.0.1:${port}/callback`,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const backend = {
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    output: '',
    exited: false,
    stop: () => {
      if (!backend.exited) child.kill();
      return new Promise(resolve => (backend.exited ? resolve() : child.once('exit', resolve)));
    },
  };
  child.stdout.on('data', chunk => { backend.output += chunk; });
  child.stderr.on('data', chunk => { backend.output += chunk; });
  child.on('exit', () => { backend.exited = true; });
  await waitFor(() => backend.output.includes('Server running') || backend.exited, STARTUP_TIMEOUT_MS);
  if (backend.exited) throw new Error(`Backend exited during startup:\n${backend.output}`);
  return backend;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return true;
}

async function callMcpTool(backend, tool, { token, args = {} } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${backend.baseUrl}/api/mcp/${tool}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args }),
    });
  } catch (err) {
    throw new Error(`MCP call to ${tool} got no response (${err.message}). Backend output:\n${backend.output}`);
  }
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  STALLED_TOKEN,
  callMcpTool,
  makeTempDir,
  removeDir,
  standInUvRunningFakeServer,
  startBackend,
  startFakeSpotify,
  waitFor,
  writeStandInUv,
};
