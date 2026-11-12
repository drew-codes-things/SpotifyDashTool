const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  STALLED_TOKEN,
  removeDir,
  standInUvRunningFakeServer,
  startBackend,
  startFakeSpotify,
} = require('./helpers');

const TEST_SPOTIFY_TIMEOUT_MS = 300;
const CLIENT_GIVE_UP_MS = 3000;

let spotify;
let backend;
let uvDir;

before(async () => {
  spotify = await startFakeSpotify();
  uvDir = standInUvRunningFakeServer();
  backend = await startBackend({
    uvDir,
    spotifyApiBase: spotify.apiBase,
    extraEnv: { SPOTIFY_TIMEOUT_MS: String(TEST_SPOTIFY_TIMEOUT_MS) },
  });
});

after(async () => {
  await backend.stop();
  await spotify.close();
  removeDir(uvDir);
});

async function requestWithStalledSpotify(pathAndQuery, init = {}) {
  const response = await fetch(`${backend.baseUrl}${pathAndQuery}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${STALLED_TOKEN}` },
    signal: AbortSignal.timeout(CLIENT_GIVE_UP_MS),
  });
  return { status: response.status, body: await response.json() };
}

test('a stalled Spotify token check times out with a JSON error', async () => {
  const { status, body } = await requestWithStalledSpotify('/api/mcp/get_queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args: {} }),
  });
  assert.equal(status, 502);
  assert.match(body.error, /timeout/i);
});

test('a stalled Spotify track lookup times out with a JSON error', async () => {
  const { status, body } = await requestWithStalledSpotify('/api/tracks/abc');
  assert.ok(status >= 500, `expected a server error status, got ${status}`);
  assert.equal(typeof body.error, 'string');
});

test('a stalled Spotify playlist listing times out with a JSON error', async () => {
  const { status, body } = await requestWithStalledSpotify('/api/playlists');
  assert.ok(status >= 500, `expected a server error status, got ${status}`);
  assert.equal(typeof body.error, 'string');
});
