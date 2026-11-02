import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig } from './config.mjs';
import { createRun, investigate, loadRuns, markdownReport } from './agent.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);

export async function createApp(config, options = {}) {
  const sessionToken = randomBytes(32).toString('hex');
  const runs = new Map((await loadRuns(config.dataDir)).map(run => [run.id, run]));
  let active = null;
  let lastRunAt = 0;
  const runner = options.runner || investigate;
  const pending = new Set();
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) return json(403, { error: 'Untrusted host.' });
      if (req.headers.origin && !hosts.map(host => `http://${host}`).includes(req.headers.origin)) return json(403, { error: 'Untrusted origin.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Cross-site requests are blocked.' });
      if (!['GET', 'POST'].includes(req.method)) return json(405, { error: 'Method not allowed.' });
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (req.method === 'GET' && assets.has(pathname)) {
        const [name, type] = assets.get(pathname);
        res.writeHead(200, { 'Content-Type': type });
        return res.end(await readFile(path.join(ROOT, 'public', name)));
      }
      if (req.method === 'GET' && pathname === '/api/bootstrap') {
        res.setHeader('Set-Cookie', `rd_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/api`);
        return json(200, { sessionToken, provider: { name: 'OpenRouter', model: config.model, configured: Boolean(config.apiKey) }, activeRunId: active });
      }
      if (!pathname.startsWith('/api/')) return json(404, { error: 'Not found.' });
      // Direct downloads need browser-native navigation. The cookie is accepted only for
      // read-only export URLs; every other API operation still requires the bearer token.
      const isDownload = req.method === 'GET' && /^\/api\/runs\/[a-f0-9-]{36}\/(report|candidate|evidence)$/.test(pathname);
      const cookieToken = isDownload ? req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('rd_session='))?.slice(11) : '';
      const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || cookieToken || '');
      const expected = Buffer.from(sessionToken);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(401, { error: 'Reload the dashboard to start a local session.' });
      if (pathname === '/api/runs' && req.method === 'GET') {
        return json(200, [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(run => ({ id: run.id, startedAt: run.startedAt, mode: run.mode, status: run.status, gate: run.gate })));
      }
      if (pathname === '/api/runs' && req.method === 'POST') {
        if (active) return json(409, { error: 'An investigation is already running.' });
        if (Date.now() - lastRunAt < 2000) return json(429, { error: 'Wait a moment before starting another investigation.' });
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'Send application/json.' });
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2048) return json(413, { error: 'Request too large.' });
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { error: 'Invalid JSON.' }); }
        if (!body || Array.isArray(body) || Object.keys(body).some(key => key !== 'mode') || !['demo', 'openrouter'].includes(body.mode)) return json(400, { error: 'Choose offline playbook or AI investigation mode.' });
        if (body.mode === 'openrouter' && !config.apiKey) return json(400, { error: 'Add your AI service key to .env and restart the app.' });
        const run = createRun(body.mode, config.model);
        active = run.id;
        lastRunAt = Date.now();
        runs.set(run.id, run);
        const job = Promise.resolve().then(() => runner(run, config)).catch(() => {
          run.status = 'failed'; run.gate = 'HOLD'; run.error = 'Investigation could not be saved. Check local storage permissions.';
        }).finally(() => { active = null; pending.delete(job); });
        pending.add(job);
        return json(202, { id: run.id });
      }
      const match = pathname.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(report|candidate|evidence))?$/);
      if (req.method === 'GET' && match) {
        const run = runs.get(match[1]);
        if (!run) return json(404, { error: 'Investigation not found.' });
        if (match[2] === 'report') {
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="release-detective-${run.id}.md"` });
          return res.end(markdownReport(run));
        }
        if (match[2] === 'candidate') {
          if (!run.candidate) return json(409, { error: 'No candidate policy is available.' });
          res.setHeader('Content-Disposition', 'attachment; filename="facility-policy.candidate.json"');
          return json(200, run.candidate.policy);
        }
        if (match[2] === 'evidence') res.setHeader('Content-Disposition', `attachment; filename="evidence-${run.id}.json"`);
        return json(200, run);
      }
      return json(404, { error: 'Not found.' });
    } catch {
      if (!res.headersSent) json(500, { error: 'The local server could not complete this request.' });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    listen: (port = config.port) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    }),
    close: async () => {
      await Promise.allSettled([...pending]);
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const app = await createApp(config);
    console.log(`Release Detective is running at ${await app.listen()}`);
    console.log(`OpenRouter: ${config.apiKey ? 'key configured' : 'add your key to release-detective/.env'} | Model: ${config.model}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  } catch (error) { console.error(error.code === 'EADDRINUSE' ? 'Port is already in use. Change PORT in .env.' : 'Unable to start Release Detective. Check .env settings and file permissions.'); process.exitCode = 1; }
}
