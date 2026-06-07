const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const MCP_DIR = path.join(__dirname, '..', 'mcp');

let mcpProcess = null;
let rl = null;
let requestId = 1;
const pending = new Map();
let initialized = false;
let initPromise = null;

let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 5;
const BASE_RESTART_DELAY_MS = 1000;

function startMcpProcess() {
  if (mcpProcess) return;

  mcpProcess = spawn('uv', ['run', 'python', 'server.py'], {
    cwd: MCP_DIR,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env },
  });

  mcpProcess.on('spawn', () => {
    restartAttempts = 0;
  });

  rl = readline.createInterface({ input: mcpProcess.stdout });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const id = msg.id;
    if (id !== undefined && pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  mcpProcess.on('exit', (code) => {
    console.error(`[mcp-bridge] MCP process exited with code ${code}`);
    mcpProcess = null;
    rl = null;
    initialized = false;
    initPromise = null;

    for (const [, { reject }] of pending) {
      reject(new Error('MCP process exited unexpectedly'));
    }
    pending.clear();

    if (restartAttempts < MAX_RESTART_ATTEMPTS) {
      const delay = BASE_RESTART_DELAY_MS * Math.pow(2, restartAttempts);
      restartAttempts++;
      console.error(
        `[mcp-bridge] Restarting MCP in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`
      );
      setTimeout(() => {
        startMcpProcess();
        ensureInitialized().catch(err => {
          console.error('[mcp-bridge] Re-init after restart failed:', err.message);
        });
      }, delay);
    } else {
      console.error('[mcp-bridge] Max restart attempts reached. MCP bridge is offline.');
    }
  });
}

function send(message) {
  if (!mcpProcess) throw new Error('MCP process not running');
  mcpProcess.stdin.write(JSON.stringify(message) + '\n');
}

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`MCP call timed out: ${method}`));
      }
    }, 15000);
  });
}

async function ensureInitialized() {
  if (initialized) return;
  if (initPromise) return initPromise;

  startMcpProcess();

  initPromise = (async () => {
    try {
      const result = await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'spotify-sort-tool-backend', version: '1.0.0' },
      });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      initialized = true;
      console.log('[mcp-bridge] MCP server initialized, protocol version:', result?.protocolVersion);
    } catch (err) {
      initialized = false;
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

async function callTool(toolName, args = {}) {
  await ensureInitialized();
  const result = await rpc('tools/call', { name: toolName, arguments: args });
  if (!result || !result.content || result.content.length === 0) return null;

  const blocks = result.content.filter(c => c.type === 'text' && c.text?.trim());
  if (blocks.length === 0) return null;

  if (blocks.length === 1) {
    try { return JSON.parse(blocks[0].text); } catch { return blocks[0].text; }
  }

  const parsed = blocks.map(c => {
    try { return { ok: true, value: JSON.parse(c.text) }; }
    catch { return { ok: false, value: c.text }; }
  });

  if (parsed.every(p => p.ok)) {
    const values = parsed.map(p => p.value);
    if (values.length === 1 && Array.isArray(values[0])) return values[0];
    const flat = [];
    for (const v of values) {
      if (Array.isArray(v)) flat.push(...v);
      else flat.push(v);
    }
    return flat;
  }

  const joined = blocks.map(c => c.text).join('');
  try { return JSON.parse(joined); } catch { return joined; }
}

module.exports = { callTool, ensureInitialized };
