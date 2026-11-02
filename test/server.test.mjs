import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.mjs';

async function appTest(callback, options = {}, configured = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'release-detective-http-'));
  const key = configured ? ['synthetic', 'server', 'credential'].join('-') : '';
  const app = await createApp({ port: 4317, model: 'test/model', apiKey: key, dataDir: directory }, options);
  const url = await app.listen(0);
  try { await callback(url, key); }
  finally {
    await app.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('release-detective-http-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('dashboard protects responses and never exposes .env or its configured key', async () => appTest(async (url, key) => {
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.ok(page.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.equal((await page.text()).includes(key), false);
  for (const route of ['/.env', '/src/config.mjs', '/fixtures/facility-policy.json', '/.git/config']) assert.equal((await fetch(url + route)).status, 404);
  const bootstrap = await (await fetch(url + '/api/bootstrap')).text();
  assert.equal(bootstrap.includes(key), false);
  assert.equal(JSON.parse(bootstrap).provider.configured, true);
}, {}, true));

test('protected API blocks unauthenticated reads and writes', async () => appTest(async url => {
  assert.equal((await fetch(url + '/api/runs')).status, 401);
  assert.equal((await fetch(url + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'demo' }) })).status, 401);
}));

test('DNS rebinding and cross-site requests cannot obtain a local session or start work', async () => appTest(async url => {
  // Node fetch normalizes Host; send the adversarial header over a real HTTP request.
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(url + '/api/bootstrap', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.once('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(url + '/api/bootstrap', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(url + '/api/bootstrap', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
}));

test('API rejects unsupported targets, malformed input and OpenRouter without a key', async () => appTest(async url => {
  const { sessionToken } = await (await fetch(url + '/api/bootstrap')).json();
  const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  const post = body => fetch(url + '/api/runs', { method: 'POST', headers, body });
  assert.equal((await post('{invalid')).status, 400);
  assert.equal((await post(JSON.stringify({ mode: 'demo', target: 'https://example.com' }))).status, 400);
  assert.equal((await post(JSON.stringify({ mode: 'openrouter' }))).status, 400);
  assert.equal((await post(JSON.stringify({ mode: 'unknown' }))).status, 400);
  assert.equal((await post(JSON.stringify({ mode: 'demo', extra: 'x'.repeat(2500) }))).status, 413);
  assert.equal((await fetch(url + '/api/runs', { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: '{}' })).status, 415);
}));

test('an authorized demo finishes with inspectable evidence and authenticated downloads', async () => appTest(async url => {
  const bootstrap = await fetch(url + '/api/bootstrap');
  const cookie = bootstrap.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict; Path=\/api/);
  const { sessionToken } = await bootstrap.json();
  const headers = { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' };
  const created = await fetch(url + '/api/runs', { method: 'POST', headers, body: JSON.stringify({ mode: 'demo' }) });
  assert.equal(created.status, 202);
  const { id } = await created.json();
  let run;
  for (let i = 0; i < 100; i++) {
    run = await (await fetch(`${url}/api/runs/${id}`, { headers })).json();
    if (run.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(run.gate, 'PASS');
  assert.equal(run.status, 'review_required');
  assert.equal((await fetch(`${url}/api/runs/${id}/evidence`)).status, 401);
  const cookieHeaders = { Cookie: cookie.split(';')[0] };
  assert.equal((await fetch(`${url}/api/runs/${id}/report`, { headers: cookieHeaders })).status, 200);
  assert.equal((await fetch(`${url}/api/runs/${id}/report`, { headers: { ...cookieHeaders, Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(url + '/api/runs', { headers: cookieHeaders })).status, 401);
  assert.equal((await fetch(url + '/api/runs', { method: 'POST', headers: { ...cookieHeaders, 'Content-Type': 'application/json' }, body: '{"mode":"demo"}' })).status, 401);
  const report = await fetch(`${url}/api/runs/${id}/report`, { headers });
  assert.match(await report.text(), /36\/36/);
  const candidate = await (await fetch(`${url}/api/runs/${id}/candidate`, { headers })).json();
  assert.equal(candidate.requireAuthentication, true);
  assert.deepEqual(candidate.responseFields, ['id', 'code', 'name', 'type']);
  assert.equal((await (await fetch(url + '/api/runs', { headers })).json()).length, 1);
}));

test('only one investigation can run at a time', async () => {
  let finish;
  const blocker = new Promise(resolve => { finish = resolve; });
  await appTest(async url => {
    try {
      const { sessionToken } = await (await fetch(url + '/api/bootstrap')).json();
      const request = { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'demo' }) };
      assert.equal((await fetch(url + '/api/runs', request)).status, 202);
      assert.equal((await fetch(url + '/api/runs', request)).status, 409);
    } finally { finish(); }
  }, { runner: async () => blocker });
});
