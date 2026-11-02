'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { analyze, eligible, RULES } = require('../lib/rules.cjs');
const { createBridge } = require('../lib/bridge.cjs');
const { explainRule } = require('../lib/ai.cjs');

test('active-file checks find common risks with actionable local tips', () => {
  const source = ['app.use(cors());', 'router.get("/facilities", async (req, res) => {', '  const records = await prisma.facility.findMany();', '  res.json(error.stack);', '});', 'const request = { rejectUnauthorized: false };', 'db.$queryRawUnsafe(query);', 'exec(`echo ${input}`);'].join('\n');
  const rules = new Set(analyze(source).map(finding => finding.rule));
  for (const rule of ['cors', 'auth', 'fields', 'debug', 'tls', 'sql', 'shell']) assert.ok(rules.has(rule), rule);
});

test('credential findings never contain the matched secret or source snippet', () => {
  const value = 'test_' + '1234567890'.repeat(3);
  const findings = analyze(`const apiKey = "${value}";`);
  assert.equal(findings[0].rule, 'secret');
  assert.equal(JSON.stringify(findings).includes(value), false);
  assert.equal(Object.hasOwn(findings[0], 'source'), false);
});

test('ignored files, unsupported languages and oversized documents are excluded', () => {
  for (const name of ['.env', '/project/.env.production', 'C:\\repo\\node_modules\\x.js', '/repo/dist/api.js']) assert.equal(eligible(name, 'javascript', 100), false);
  assert.equal(eligible('api.js', 'javascript', 250001), false);
  assert.equal(eligible('x.md', 'markdown', 100), false);
  assert.equal(analyze('const x = "safe";', 'javascript').length, 0);
});

test('obvious comments and preceding authentication middleware do not trigger route advice', () => {
  assert.equal(analyze('// app.use(cors());\n/* rejectUnauthorized: false */').length, 0);
  assert.equal(analyze('app.use(requireAuth);\napp.get("/facilities", handler);').filter(f => f.rule === 'auth').length, 0);
  assert.equal(analyze('router.get("/facilities", requireAuth, handler);').filter(f => f.rule === 'auth').length, 0);
});

test('OpenRouter receives a fixed educational question, no active source or filename', async () => {
  const key = ['synthetic', 'key'].join('-');
  const answer = await explainRule('auth', key, 'openai/gpt-4.1-mini', async (url, request) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.headers.Authorization, `Bearer ${key}`);
    const body = JSON.parse(request.body);
    assert.equal(body.messages[1].content, RULES.auth.question);
    assert.equal(body.max_tokens, 400);
    assert.equal(request.redirect, 'error');
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Use authentication and ownership checks.' } }] }));
  });
  assert.equal(answer, 'Use authentication and ownership checks.');
});

test('AI rejects unknown rules, missing credentials and incomplete replies', async () => {
  await assert.rejects(explainRule('unknown', 'test', 'model'), /Choose a finding/);
  await assert.rejects(explainRule('auth', '', 'model'), /Add your key/);
  await assert.rejects(explainRule('auth', 'test', 'model', async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }))), /complete explanation/);
  await assert.rejects(explainRule('auth', 'test', 'model', async () => new Response('private upstream error', { status: 401 })), /HTTP 401/);
});

test('native bridge requires a token, rejects browser origins and only accepts bounded actions', async () => {
  const actions = [];
  const bridge = await createBridge(() => ({ count: 1, tip: 'Generic tip only.' }), name => actions.push(name));
  const base = `http://127.0.0.1:${bridge.port}`;
  const headers = { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(base + '/state')).status, 401);
    const state = await fetch(base + '/state', { headers });
    assert.equal(state.headers.get('cache-control'), 'no-store');
    assert.equal(state.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await state.json()).count, 1);
    assert.equal((await fetch(base + '/state', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => { const req = http.get(base + '/state', { headers: { ...headers, Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
    assert.equal(hostStatus, 403);
    assert.equal((await fetch(base + '/action', { method: 'POST', headers, body: JSON.stringify({ action: 'jump' }) })).status, 200);
    assert.deepEqual(actions, ['jump']);
    for (const body of ['{bad', JSON.stringify({ action: 'execute', command: 'test' }), JSON.stringify({ action: 'jump', path: '../.env' })]) {
      assert.equal((await fetch(base + '/action', { method: 'POST', headers, body })).status, 400);
    }
    assert.equal((await fetch(base + '/action', { method: 'POST', headers, body: 'x'.repeat(2048) })).status, 413);
    assert.deepEqual(actions, ['jump']);
  } finally { bridge.close(); }
});

test('Windows pet process connects to the authenticated bridge', { skip: process.platform !== 'win32' }, async () => {
  let connected = false;
  const bridge = await createBridge(() => { connected = true; return { focused: false, count: 0, tip: 'Test connection.' }; }, () => {});
  const python = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'pythonw.exe');
  const child = spawn(python, [path.join(__dirname, '../native/pet.py')], { windowsHide: true, env: { ...process.env, RD_PET_PORT: String(bridge.port), RD_PET_TOKEN: bridge.token }, stdio: ['ignore', 'ignore', 'pipe'] });
  let failure = '';
  child.on('error', error => { failure = error.message; });
  child.stderr.on('data', data => { failure += data.toString(); });
  try {
    for (let count = 0; count < 50 && !connected && !failure; count++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(connected, failure || 'No native connection received');
  } finally { child.kill(); bridge.close(); }
});
