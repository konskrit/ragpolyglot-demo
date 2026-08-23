const http = require('node:http');

const PORT = Number(process.env.PORT || 8090);
const ANSWER =
  process.env.STUB_LLM_ANSWER || 'Integration test answer from stub LLM.';
const DELAY_MS = Number(process.env.STUB_DELAY_MS || 0);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    await readBody(req);
    if (DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content: ANSWER },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT);
