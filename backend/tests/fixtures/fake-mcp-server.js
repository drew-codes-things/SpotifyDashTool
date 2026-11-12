const readline = require('readline');

const mode = process.env.FAKE_MCP_MODE || 'ok';
const accountId = process.env.FAKE_MCP_ACCOUNT_ID || 'mcp-account';
const exitAfterMs = Number(process.env.FAKE_MCP_EXIT_AFTER_MS) || 300;

if (mode === 'exit-after') {
  setTimeout(() => process.exit(1), exitAfterMs);
}

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function answerToolCall(id, { name, arguments: args }) {
  if (name === 'get_user_profile') return reply(id, textResult({ user_id: accountId }));
  reply(id, textResult({ tool: name, args }));
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  if (message.method === 'initialize') return reply(message.id, { protocolVersion: '2024-11-05' });
  if (message.method === 'tools/call') return answerToolCall(message.id, message.params);
});
