'use strict';
const http = require('node:http');
const { randomBytes, timingSafeEqual } = require('node:crypto');

async function createBridge(getState, action) {
  const token = randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    try {
      if (req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Forbidden' });
      const received = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
      const expected = Buffer.from(token);
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return send(401, { error: 'Unauthorized' });
      if (req.url === '/state' && req.method === 'GET') return send(200, getState());
      if (req.url !== '/action' || req.method !== 'POST') return send(404, { error: 'Not found' });
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON required' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024) return send(413, { error: 'Too large' }); chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks)); } catch { return send(400, { error: 'Invalid JSON' }); }
      if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'action') || !['next', 'jump', 'explain', 'snooze', 'wake', 'investigate', 'demo', 'review', 'evidence', 'cancel', 'tips'].includes(body.action)) return send(400, { error: 'Unsupported action' });
      await action(body.action);
      send(200, { ok: true });
    } catch { if (!res.headersSent) send(500, { error: 'Action failed' }); else res.end(); }
  });
  server.requestTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { token, port: server.address().port, close: () => { server.close(); server.closeAllConnections(); } };
}
module.exports = { createBridge };
