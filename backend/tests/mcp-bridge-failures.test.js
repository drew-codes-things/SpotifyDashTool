const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  callMcpTool,
  makeTempDir,
  removeDir,
  startBackend,
  startFakeSpotify,
  writeStandInUv,
} = require('./helpers');

const CALLS_AGAINST_A_DEAD_CHILD = 6;
const PAUSE_BETWEEN_CALLS_MS = 150;

async function assertBackendStillServes(backend) {
  assert.equal(backend.exited, false, `backend exited:\n${backend.output}`);
  const response = await fetch(`${backend.baseUrl}/api/config`);
  assert.equal(response.status, 200);
}

async function withBackend(uvDir, run) {
  const spotify = await startFakeSpotify();
  const backend = await startBackend({ uvDir, spotifyApiBase: spotify.apiBase });
  try {
    await run(backend);
  } finally {
    await backend.stop();
    await spotify.close();
    removeDir(uvDir);
  }
}

test('a missing uv gives the caller a JSON error and the backend stays up', async () => {
  await withBackend(makeTempDir(), async (backend) => {
    const { status, body } = await callMcpTool(backend, 'get_queue', { token: 'good-token' });
    assert.ok(status >= 500, `expected a server error status, got ${status}`);
    assert.equal(typeof body.error, 'string');
    await assertBackendStillServes(backend);
  });
});

test('a uv that exits at once gives JSON errors and the backend stays up', async () => {
  await withBackend(writeStandInUv('exit 1'), async (backend) => {
    for (let call = 0; call < CALLS_AGAINST_A_DEAD_CHILD; call++) {
      const { status, body } = await callMcpTool(backend, 'get_queue', { token: 'good-token' });
      assert.ok(status >= 500, `call ${call}: expected a server error status, got ${status}`);
      assert.equal(typeof body.error, 'string', `call ${call}: expected a JSON error body`);
      await new Promise(resolve => setTimeout(resolve, PAUSE_BETWEEN_CALLS_MS));
    }
    await assertBackendStillServes(backend);
  });
});
