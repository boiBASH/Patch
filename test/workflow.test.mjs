import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/config.mjs';
import { ACTIONS, applyActions, hash } from '../src/policy.mjs';
import { scanPolicy } from '../src/scanner.mjs';
import { createRun, investigate, saveRun, loadRuns, markdownReport } from '../src/agent.mjs';
import { demoPlan } from '../src/providers.mjs';
import { securityCheck } from '../scripts/security.mjs';

const baseline = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'facility-policy.json'), 'utf8'));
const config = { model: 'test/model', apiKey: '', dataDir: '' };

test('real HTTP probes detect all five exposure rules on both route aliases', async () => {
  const result = await scanPolicy(baseline);
  assert.equal(result.gate, 'HOLD');
  assert.deepEqual(result.findings.map(f => f.id), ['AUTH-001', 'ROLE-001', 'DATA-001', 'HEAD-001', 'CORS-001']);
  assert.equal(result.total, 36);
  assert.ok(result.checks.some(c => c.name.startsWith('/api/facilities') && !c.passed));
  assert.ok(result.checks.some(c => c.name.startsWith('/facilities') && !c.passed));
});

test('candidate blocks anonymous, invalid and forbidden-role access, preserves allowed users and minimizes fields', async () => {
  const originalHash = hash(baseline);
  const candidate = applyActions(baseline, Object.keys(ACTIONS));
  const result = await scanPolicy(candidate);
  assert.equal(result.gate, 'PASS');
  assert.equal(result.passed, 36);
  assert.equal(result.findings.length, 0);
  assert.equal(hash(baseline), originalHash, 'baseline must stay unchanged');
});

for (const omitted of Object.keys(ACTIONS)) {
  test(`a candidate without ${omitted} remains on hold`, async () => {
    const result = await scanPolicy(applyActions(baseline, Object.keys(ACTIONS).filter(id => id !== omitted)));
    assert.equal(result.gate, 'HOLD');
    assert.ok(result.findings.some(finding => finding.action === omitted));
  });
}

test('complete demo produces reviewable evidence, a distinct candidate and a bounded patch', async () => {
  const saved = [];
  const run = await investigate(createRun('demo', config.model), config, { persist: async value => saved.push(structuredClone(value)) });
  assert.equal(run.status, 'review_required');
  assert.equal(run.gate, 'PASS');
  assert.equal(run.patch.length, 5);
  assert.notEqual(run.source.hash, run.candidate.hash);
  assert.equal(saved[0].gate, 'HOLD');
  assert.deepEqual(run.events.map(event => event.stage), ['context', 'detect', 'reason', 'act', 'verify', 'report']);
  assert.match(markdownReport(run), /36\/36 HTTP checks passed/);
  assert.match(markdownReport(run), /does not authorize deployment/);
});

test('AI selecting only one action cannot pass the independent gate', async () => {
  const run = await investigate(createRun('openrouter', config.model), config, {
    persist: async () => {}, planner: async context => ({ ...demoPlan(context), actions: ['require_authentication'] })
  });
  assert.equal(run.gate, 'HOLD');
  assert.equal(run.status, 'blocked');
  assert.equal(run.verification.findings.length, 4);
});

test('unsupported AI action stops the workflow before a candidate is created', async () => {
  const run = await investigate(createRun('openrouter', config.model), config, {
    persist: async () => {}, planner: async context => ({ ...demoPlan(context), actions: ['disable_verifier'] })
  });
  assert.equal(run.gate, 'HOLD');
  assert.equal(run.status, 'failed');
  assert.equal(run.candidate, null);
});

test('verification failure preserves evidence and redacts credentials', async () => {
  let count = 0;
  const secret = ['sentinel', 'credential'].join('-');
  const run = await investigate(createRun('demo', config.model), { ...config, apiKey: secret }, {
    persist: async () => {}, scanner: async policy => {
      if (count++ > 0) throw new Error(`Probe failed ${secret}`);
      return scanPolicy(policy);
    }
  });
  assert.equal(run.gate, 'HOLD');
  assert.equal(run.status, 'failed');
  assert.ok(run.baseline);
  assert.equal(JSON.stringify(run).includes(secret), false);
});

test('empty verification claiming PASS cannot pass the gate', async () => {
  let count = 0;
  const run = await investigate(createRun('demo', config.model), config, {
    persist: async () => {}, scanner: async policy => count++ === 0 ? scanPolicy(policy) : { gate: 'PASS', total: 0, passed: 0, checks: [], findings: [] }
  });
  assert.equal(run.gate, 'HOLD');
});

test('replacing required probes with duplicate passing checks cannot satisfy verification', async () => {
  let count = 0;
  const run = await investigate(createRun('demo', config.model), config, {
    persist: async () => {}, scanner: async policy => {
      const result = await scanPolicy(policy);
      if (count++ > 0) result.checks = Array.from({ length: result.total }, () => result.checks[0]);
      return result;
    }
  });
  assert.equal(run.gate, 'HOLD');
});

test('interrupted persisted investigations recover on hold after restart', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'release-detective-test-'));
  try {
    await saveRun(createRun('demo', config.model), directory);
    await writeFile(path.join(directory, '00000000-0000-0000-0000-000000000000.json'), '{bad json');
    const runs = await loadRuns(directory);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'failed');
    assert.equal(runs[0].gate, 'HOLD');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('release-detective-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('prototype source has no detected credentials and no third-party dependencies', async () => {
  const result = await securityCheck();
  assert.equal(result.passed, true, JSON.stringify(result.findings));
  assert.equal(result.dependencyCount, 0);
});
