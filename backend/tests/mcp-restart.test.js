const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  callMcpTool,
  removeDir,
  startBackend,
  startFakeSpotify,
  waitFor,
  writeStandInUv,
} = require('./helpers');

const MAX_RESTART_ATTEMPTS = 5;
const CAP_TIMEOUT_MS = 10000;
const QUIET_PERIOD_MS = 1500;
const CAP_MESSAGE = 'Max restart attempts reached';

function countRestarts(output) {
  return (output.match(/Restarting MCP in/g) || []).length;
}

test('a child that keeps dying after start is restarted with backoff until the cap', async () => {
  const spotify = await startFakeSpotify();
  const uvDir = writeStandInUv('sleep 0.3\nexit 1');
  const backend = await startBackend({
    uvDir,
    spotifyApiBase: spotify.apiBase,
    extraEnv: { MCP_RESTART_BASE_DELAY_MS: '20' },
  });
  try {
    const { status } = await callMcpTool(backend, 'get_queue', { token: 'good-token' });
    assert.ok(status >= 500, `expected a server error status, got ${status}`);

    const capped = await waitFor(() => backend.output.includes(CAP_MESSAGE), CAP_TIMEOUT_MS);
    assert.ok(capped, `cap message never appeared; saw ${countRestarts(backend.output)} restarts:\n${backend.output}`);

    const restartsAtCap = countRestarts(backend.output);
    await new Promise(resolve => setTimeout(resolve, QUIET_PERIOD_MS));
    assert.equal(restartsAtCap, MAX_RESTART_ATTEMPTS);
    assert.equal(countRestarts(backend.output), restartsAtCap, 'restarts continued after the cap');
    assert.match(backend.output, /attempt 5\/5/);
  } finally {
    await backend.stop();
    await spotify.close();
    removeDir(uvDir);
  }
});
