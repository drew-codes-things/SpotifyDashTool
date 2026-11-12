const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  callMcpTool,
  removeDir,
  standInUvRunningFakeServer,
  startBackend,
  startFakeSpotify,
} = require('./helpers');

let spotify;
let backend;
let uvDir;

before(async () => {
  spotify = await startFakeSpotify();
  uvDir = standInUvRunningFakeServer();
  backend = await startBackend({ uvDir, spotifyApiBase: spotify.apiBase });
});

after(async () => {
  await backend.stop();
  await spotify.close();
  removeDir(uvDir);
});

test('an MCP call without a token is refused with 401', async () => {
  const { status, body } = await callMcpTool(backend, 'get_queue');
  assert.equal(status, 401);
  assert.match(body.error, /token/i);
});

test('an MCP call with a token Spotify rejects is refused with 401', async () => {
  const { status } = await callMcpTool(backend, 'get_queue', { token: 'bad-token' });
  assert.equal(status, 401);
});

test('an MCP call from a different Spotify account is refused with 403', async () => {
  const { status } = await callMcpTool(backend, 'get_queue', { token: 'other-account-token' });
  assert.equal(status, 403);
});

test('an MCP call with a valid token for the MCP account runs the tool', async () => {
  const { status, body } = await callMcpTool(backend, 'get_queue', { token: 'good-token', args: { limit: 3 } });
  assert.equal(status, 200);
  assert.deepEqual(body.result, { tool: 'get_queue', args: { limit: 3 } });
});

test('a verified token is checked against Spotify once, then cached', async () => {
  await callMcpTool(backend, 'get_queue', { token: 'good-token' });
  await callMcpTool(backend, 'get_queue', { token: 'good-token' });
  const goodTokenChecks = spotify.meRequests.filter(token => token === 'good-token').length;
  assert.equal(goodTokenChecks, 1);
});
