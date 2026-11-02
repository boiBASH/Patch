'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createInvestigationController } = require('../lib/investigation.cjs');
const { createBridge } = require('../lib/bridge.cjs');

const runtimeRoot = path.resolve(__dirname, '../..');
const key = ['synthetic', 'integration', 'credential'].join('-');
const response = actions => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: 'Synthetic API exposure needs correction.', rationale: 'Anonymous requests returned records. ' + key, actions, reviewNotes: 'Review the candidate; no deployment is authorized.' }) } }] }));

async function setup(t, fetchImpl, updates = []) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rd-investigation-'));
  const controller = await createInvestigationController({ runtimeRoot, dataDir, credentials: async () => ({ apiKey: key, model: 'test/model' }), fetchImpl, onUpdate: value => updates.push(value) });
  t.after(async () => {
    controller.dispose();
    const resolved = await fs.realpath(dataDir);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(resolved), /^rd-investigation-/);
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return controller;
}

test('connected AI workflow sends HTTP evidence, writes and verifies a real candidate, and deduplicates concurrent starts', async t => {
  let calls = 0; const updates = [];
  const baselineBefore = await fs.readFile(path.join(runtimeRoot, 'fixtures/facility-policy.json'), 'utf8');
  const controller = await setup(t, async (url, request) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(request.body); const context = JSON.parse(body.messages[1].content);
    assert.equal(context.checks.length, 36);
    assert.equal(context.findings.length, 5);
    assert.equal(context.checks.filter(check => !check.passed).length, 32);
    assert.equal(request.body.includes(key), false);
    assert.equal(request.body.includes(runtimeRoot), false);
    return response(Object.keys(context.allowedActions));
  }, updates);
  const first = controller.start();
  assert.equal(controller.start(), first);
  const run = await first;
  assert.equal(calls, 1);
  assert.equal(run.gate, 'PASS'); assert.equal(run.status, 'review_required');
  assert.equal(run.verification.passed, 36); assert.equal(run.patch.length, 5);
  assert.deepEqual([...new Set(updates.map(item => item.stage))], ['queued', 'context', 'detect', 'reason', 'act', 'verify', 'report']);
  assert.ok(run.timing.elapsedMs > 0); assert.ok(run.timing.stages.some(item => item.stage === 'reason'));
  assert.equal(controller.snapshot().reviewReady, true);
  assert.equal(controller.snapshot().provider, 'AI investigation');
  const files = await controller.review();
  const report = await fs.readFile(files.report, 'utf8');
  assert.match(report, /Mode: AI investigation/);
  assert.doesNotMatch(report, /openrouter|test\/model/i);
  const evidence = JSON.parse(await fs.readFile(files.evidence, 'utf8'));
  assert.equal(evidence.mode, 'openrouter');
  assert.equal(evidence.model, 'test/model');
  assert.equal(JSON.parse(await fs.readFile(files.candidate, 'utf8')).requireAuthentication, true);
  for (const name of ['report', 'evidence', 'context', 'patch']) assert.equal((await fs.readFile(files[name], 'utf8')).includes(key), false);
  assert.equal(await fs.readFile(path.join(runtimeRoot, 'fixtures/facility-policy.json'), 'utf8'), baselineBefore);
});

test('an incomplete AI fix is materialized but stays on HOLD after independent checks', async t => {
  const controller = await setup(t, async () => response(['require_authentication']));
  const run = await controller.start();
  assert.equal(run.gate, 'HOLD'); assert.equal(run.status, 'blocked');
  assert.equal(run.verification.findings.length, 4);
  assert.equal((await fs.stat(controller.files().candidate)).isFile(), true);
});

test('unsupported model actions cannot create a candidate', async t => {
  const controller = await setup(t, async () => response(['execute_shell']));
  const run = await controller.start();
  assert.equal(run.gate, 'HOLD'); assert.equal(run.candidate, null);
  await assert.rejects(fs.stat(controller.files().candidate), { code: 'ENOENT' });
});

test('cancelling a pending model request stops the workflow on HOLD', async t => {
  let requested; const started = new Promise(resolve => { requested = resolve; });
  const controller = await setup(t, async (_url, request) => {
    requested();
    return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  const promise = controller.start(); await started; controller.cancel();
  const run = await promise;
  assert.equal(run.gate, 'HOLD'); assert.match(run.error, /cancelled/); assert.equal(run.candidate, null);
});

test('editing the candidate invalidates the review result', async t => {
  const controller = await setup(t, async (_url, request) => response(Object.keys(JSON.parse(JSON.parse(request.body).messages[1].content).allowedActions)));
  await controller.start();
  await fs.writeFile(controller.files().candidate, '{}');
  await assert.rejects(controller.review(), /changed since verification/);
  assert.equal(controller.snapshot().gate, 'HOLD');
});

test('pet bridge starts the same runner and rejects arbitrary targets and unauthenticated execution', async t => {
  const controller = await setup(t, async () => { throw new Error('Offline mode must not call AI'); });
  let job;
  const bridge = await createBridge(() => ({ investigation: controller.snapshot() }), action => { if (action === 'demo') job = controller.start('demo'); });
  t.after(() => bridge.close());
  const url = `http://127.0.0.1:${bridge.port}/action`;
  const headers = { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(url, { method: 'POST', body: '{"action":"demo"}' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'demo', target: 'https://production.example' }) })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers, body: '{"action":"demo"}' })).status, 200);
  assert.equal((await job).gate, 'PASS');
});
