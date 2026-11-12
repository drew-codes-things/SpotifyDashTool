const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  callMcpTool,
  removeDir,
  standInUvRunningFakeServer,
  startBackend,
  startFakeSpotify,
} = require('./helpers');

const LARGE_PLAYLIST_SIZE = 5000;
const OVERSIZED_PLAYLIST_SIZE = 60000;

let spotify;
let backend;
let uvDir;

function trackUris(count) {
  return Array.from({ length: count }, (_, index) => `spotify:track:${String(index).padStart(22, '0')}`);
}

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

test('saving a 5,000 track playlist fits in the request body limit', async () => {
  const args = { playlist_id: 'p1', track_uris: trackUris(LARGE_PLAYLIST_SIZE) };
  const { status, body } = await callMcpTool(backend, 'save_playlist_order', { token: 'good-token', args });
  assert.equal(status, 200);
  assert.equal(body.result.args.track_uris.length, LARGE_PLAYLIST_SIZE);
});

test('an oversized body gets a JSON 413 error', async () => {
  const args = { playlist_id: 'p1', track_uris: trackUris(OVERSIZED_PLAYLIST_SIZE) };
  const { status, body } = await callMcpTool(backend, 'save_playlist_order', { token: 'good-token', args });
  assert.equal(status, 413);
  assert.match(body.error, /too large/i);
});

test('malformed JSON gets a JSON 400 error', async () => {
  const response = await fetch(`${backend.baseUrl}/api/mcp/get_queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good-token' },
    body: '{"args":',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
});
