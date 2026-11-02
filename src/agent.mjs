import { readFile, mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { scanPolicy } from './scanner.mjs';
import { planWithProvider, validatePlan } from './providers.mjs';
import { applyActions, hash, policyPatch } from './policy.mjs';

export const LIMITATIONS = [
  'Only the bundled synthetic API and its two route aliases are tested. No live iVoucher, cloud, or third-party target is scanned.',
  'The patch changes a demo policy file, not production application code. Real authentication, tenant isolation, cloud IAM and infrastructure remain outside this prototype.',
  'Passing these checks requires human review and does not authorize deployment or establish the absence of all vulnerabilities.'
];

export function createRun(mode, model) {
  if (!['demo', 'openrouter'].includes(mode)) throw new Error('Mode must be demo or openrouter.');
  return {
    id: randomUUID(), startedAt: new Date().toISOString(), mode, model: mode === 'demo' ? 'Deterministic demo' : model,
    status: 'running', gate: 'HOLD', stage: 'queued', events: [], limitations: LIMITATIONS,
    scope: 'Isolated synthetic facility API on loopback. Non-destructive HTTP probes. No production access.',
    baseline: null, plan: null, candidate: null, verification: null, patch: [], error: null
  };
}

export async function saveRun(run, dataDir) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, `${run.id}.json`);
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(run, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, file);
}

export async function loadRuns(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const result = [];
  for (const name of (await readdir(dataDir)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
    try {
      const run = JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
      if (`${run.id}.json` !== name || !Array.isArray(run.events)) continue;
      if (run.status === 'running') {
        run.status = 'failed'; run.gate = 'HOLD'; run.stage = 'interrupted';
        run.error = 'The app restarted before verification completed. Start a new investigation.';
        await saveRun(run, dataDir);
      }
      result.push(run);
    } catch { /* A corrupt local report cannot become passing evidence. */ }
  }
  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function investigate(run, config, options = {}) {
  const started = performance.now();
  let stageStarted = started;
  run.timing = { elapsedMs: 0, stages: [], kind: 'Measured engine wall time; excludes human review.' };
  const finishStage = () => {
    const now = performance.now();
    if (run.stage !== 'queued') run.timing.stages.push({ stage: run.stage, elapsedMs: Math.round(now - stageStarted) });
    stageStarted = now;
    run.timing.elapsedMs = Math.round(now - started);
  };
  const checkCancelled = () => { if (config.signal?.aborted) throw new Error('Investigation cancelled. Candidate remains on hold.'); };
  const persist = options.persist || (value => saveRun(value, config.dataDir));
  const scanner = options.scanner || scanPolicy;
  const planner = options.planner || ((context) => planWithProvider(run.mode, context, config));
  const progress = async (stage, message) => {
    checkCancelled();
    finishStage();
    run.stage = stage;
    run.events.push({ at: new Date().toISOString(), stage, message });
    await persist(run);
  };
  try {
    await progress('context', 'Loaded the bundled synthetic facility policy. No repository secrets or real records are collected.');
    const policy = JSON.parse(await readFile(path.join(ROOT, 'fixtures', 'facility-policy.json'), 'utf8'));
    run.source = { file: 'fixtures/facility-policy.json', hash: hash(policy), policy };
    await progress('detect', 'Started an isolated baseline API and probed authentication, roles, fields, headers and CORS.');
    run.baseline = await scanner(policy);
    await progress('reason', `${run.baseline.findings.length} findings collected. ${run.mode === 'demo' ? 'Using the deterministic demo playbook.' : 'Requesting an AI investigation and remediation plan.'}`);
    run.reasoningContext = {
      scenario: 'Bundled synthetic facility API only',
      policy, findings: run.baseline.findings, checks: run.baseline.checks,
      goal: 'Prepare a separate candidate that satisfies the same authentication, authorization, data, header and CORS checks.'
    };
    run.plan = validatePlan(await planner(run.reasoningContext), run.baseline.findings);
    for (const field of ['summary', 'rationale', 'reviewNotes']) {
      if (config.apiKey) run.plan[field] = run.plan[field].split(config.apiKey).join('[REDACTED]');
    }
    await progress('act', 'Validated the plan against permitted actions and prepared a separate candidate policy.');
    const candidate = applyActions(policy, run.plan.actions);
    run.candidate = { file: 'candidate/facility-policy.json', hash: hash(candidate), policy: candidate };
    run.patch = policyPatch(policy, candidate);
    const materialized = options.materializeCandidate ? await options.materializeCandidate(run) : candidate;
    if (hash(materialized) !== run.candidate.hash) throw new Error('Saved candidate differs from the planned candidate. Verification stopped.');
    await progress('verify', 'Built a fresh in-memory candidate API and repeated the unchanged security probes.');
    run.verification = await scanner(materialized);
    checkCancelled();
    const probeIds = checks => checks.map(check => `${check.rule}:${check.name}`).sort();
    // Fail closed: empty, incomplete or non-passing evidence cannot satisfy the gate.
    const verified = run.verification.gate === 'PASS' && run.verification.total > 0
      && run.verification.total === run.baseline.total && run.verification.passed === run.verification.total
      && run.verification.checks.length === run.verification.total && run.verification.checks.every(check => check.passed)
      && JSON.stringify(probeIds(run.verification.checks)) === JSON.stringify(probeIds(run.baseline.checks))
      && run.verification.findings.length === 0;
    run.gate = verified ? 'PASS' : 'HOLD';
    run.status = verified ? 'review_required' : 'blocked';
    run.finishedAt = new Date().toISOString();
    await progress('report', verified ? 'Candidate checks passed. Evidence and policy patch are ready for human review. No deployment occurred.' : 'Candidate failed verification. Review the remaining findings; the gate remains on hold.');
  } catch (error) {
    finishStage();
    run.status = 'failed'; run.gate = 'HOLD'; run.stage = 'failed'; run.finishedAt = new Date().toISOString();
    const message = config.signal?.aborted ? 'Investigation cancelled. Candidate remains on hold.' : error instanceof Error ? error.message : 'Investigation failed.';
    run.error = config.apiKey ? message.split(config.apiKey).join('[REDACTED]') : message;
    run.events.push({ at: new Date().toISOString(), stage: 'failed', message: run.error });
    await persist(run);
  } finally {
    finishStage();
    await persist(run);
  }
  return run;
}

export function markdownReport(run) {
  const lines = [
    '# Release Detective investigation', '', `Run: ${run.id}`, `Mode: ${run.mode === 'demo' ? 'Offline playbook' : 'AI investigation'}`,
    `Candidate gate: ${run.gate} | Status: ${run.status}`, '', '## Tested scope', '', run.scope,
    '', '## Measured execution time', '', `${run.timing?.elapsedMs ?? 'Unavailable'} ms. Engine execution only; human review and manual comparison are not measured.`,
    '', '## Findings', '', ...(run.baseline?.findings || []).map(f => `- ${f.id} [${f.severity}]: ${f.title}`),
    '', '## Proposed remediation', '', run.plan?.summary || 'No plan completed.', '', run.plan?.rationale || '',
    '', '```json', JSON.stringify(run.patch, null, 2), '```', '', '## Verification', '',
    run.verification ? `${run.verification.passed}/${run.verification.total} HTTP checks passed.` : 'Verification incomplete.',
    '', '| Check | Result | Observed |', '| --- | --- | --- |',
    ...(run.verification?.checks || []).map(c => `| ${c.name} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.observed} |`),
    '', `Source SHA-256: ${run.source?.hash || 'unavailable'}`, `Candidate SHA-256: ${run.candidate?.hash || 'unavailable'}`,
    '', '## Human review and residual risks', '', run.plan?.reviewNotes || '', ...run.limitations.map(item => `- ${item}`)
  ];
  if (run.error) lines.push('', `Error: ${run.error}`);
  return lines.join('\n') + '\n';
}
