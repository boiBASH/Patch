import { readFile, writeFile, mkdir, readdir, lstat, symlink, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRouterPlan, validatePlan } from './providers.mjs';

const runtime = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const routeFile = 'apps/api/src/app.ts';
const authLine = 'apiRouter.get("/facilities", authenticate, async';
const unguardedLine = 'apiRouter.get("/facilities", async';
const projectionLine = '        select: publicFacilitySelect,\n';
const digest = value => createHash('sha256').update(value).digest('hex');
const read = file => readFile(file, 'utf8');
const json = async file => JSON.parse(await read(file));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2));
// VS Code URIs commonly use c:, while Vite resolves imports through C:.
// A consistent drive spelling is required for Vitest's module mock registry.
export function canonicalDrive(value) { return value.replace(/^[a-z]:/, drive => drive.toUpperCase()); }

export function seedRegression(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (normalized.split(authLine).length !== 2 || normalized.split(projectionLine).length !== 2)
    throw new Error('The approved route template has changed. Review the lab recipe before running.');
  return normalized.replace(authLine, unguardedLine).replace(projectionLine, '');
}

export function patchRoute(source, actions) {
  let candidate = source;
  for (const action of actions) {
    if (action === 'require_authentication') {
      if (candidate.split(unguardedLine).length !== 2) throw new Error('Authentication patch did not match exactly once.');
      candidate = candidate.replace(unguardedLine, authLine);
    } else if (action === 'minimize_response') {
      const anchor = '        where: {\n          onboardingStatus: "APPROVED"\n        },\n';
      if (candidate.split(anchor).length !== 2 || candidate.includes(projectionLine)) throw new Error('Projection patch did not match exactly once.');
      candidate = candidate.replace(anchor, anchor + projectionLine);
    } else throw new Error('This project recipe does not support that action.');
  }
  return candidate;
}

async function copySafe(from, to) {
  const info = await lstat(from);
  if (info.isSymbolicLink()) throw new Error('Source links are not copied into the lab.');
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) {
      if (['node_modules', 'dist', '.git', 'coverage', '.vite', 'uploads', 'generated'].includes(name) || name.startsWith('.env') || /\.(log|tsbuildinfo)$/.test(name)) continue;
      await copySafe(path.join(from, name), path.join(to, name));
    }
  } else if (info.isFile()) await writeFile(to, await readFile(from));
}

async function sourceScan(root) {
  const findings = []; let files = 0;
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.release-detective', 'dist', 'coverage', 'test'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected source link.');
      if (entry.isDirectory()) await visit(file);
      else if (/\.(ts|tsx|js|json|ya?ml)$/.test(entry.name)) {
        files++;
        (await read(file)).split(/\r?\n/).forEach((line, i) => {
          if (/sk-(?:or-v1-|proj-|live-)?[A-Za-z0-9_-]{28,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)
            || /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9/+_-]{24,}["']/i.test(line))
            findings.push({ file: path.relative(root, file), line: i + 1, rule: 'credential-pattern' });
        });
      }
    }
  }
  await visit(root);
  return { passed: findings.length === 0, files, findings, scope: 'Pattern scan of copied source and configuration. Test credential fixtures and generated outputs excluded. Not exhaustive.' };
}

function cleanEnvironment() {
  const env = {};
  for (const name of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATH', 'Path', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PATHEXT', 'COMSPEC']) if (process.env[name]) env[name] = process.env[name];
  return { ...env, NODE_ENV: 'test', CI: 'true', NO_COLOR: '1', DATABASE_URL: 'postgresql://lab:lab@127.0.0.1:1/isolated_no_database',
    JWT_SECRET: randomBytes(32).toString('hex'), QR_TOKEN_SECRET: randomBytes(32).toString('hex'), CORS_ORIGIN: 'https://lab.example.invalid',
    VITE_API_BASE_URL: '/api', RD_PROJECT_LAB: '1' };
}

export async function investigateProject({ projectRoot, outputRoot, apiKey = '', model = 'openai/gpt-4.1-mini', mode = 'openrouter', signal, onUpdate = () => {} }) {
  if (!['openrouter', 'demo'].includes(mode)) throw new Error('Unsupported project investigation mode.');
  projectRoot = canonicalDrive(await realpath(projectRoot));
  outputRoot = canonicalDrive(path.resolve(outputRoot));
  const original = await read(path.join(projectRoot, routeFile));
  const baseline = seedRegression(original); // Validate before creating any output.
  const id = randomUUID();
  const directory = path.join(outputRoot, id), candidateRoot = path.join(directory, 'candidate');
  await mkdir(candidateRoot, { recursive: true });
  const run = { id, kind: 'ivoucher-project-lab', mode, model: mode === 'demo' ? 'Offline playbook' : model, status: 'running', stage: 'context', gate: 'HOLD', events: [], checks: [], startedAt: new Date().toISOString(),
    scope: 'Controlled regression in an isolated iVoucher copy. Real routes and JWT middleware; synthetic database records. No production access or deployment.',
    files: { baseline: path.join(directory, 'baseline-app.ts'), candidate: path.join(candidateRoot, routeFile), report: path.join(directory, 'report.md'), evidence: path.join(directory, 'evidence.json'), patch: path.join(directory, 'fix.patch'), context: path.join(directory, 'model-context.json') },
    originalHash: digest(original), directory, candidateRoot };
  const started = performance.now();
  const update = async (stage, message) => {
    run.stage = stage; run.events.push({ stage, message, elapsedMs: Math.round(performance.now() - started) });
    run.timing = { elapsedMs: Math.round(performance.now() - started) };
    await save(run.files.evidence, run); onUpdate(structuredClone(run));
  };
  const env = cleanEnvironment();
  const node = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe') : process.execPath;
  const npm = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
  async function execute(label, executable, args, cwd, extraEnv = {}, timeout = 180000) {
    if (signal?.aborted) throw new Error('Investigation cancelled.');
    const begin = performance.now();
    const result = await new Promise(resolve => {
      let output = '', settled = false;
      const child = spawn(executable, args, { cwd, env: { ...env, ...extraEnv }, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      const finish = (code, error = '') => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); resolve({ code, error, output }); };
      const cancel = () => { child.kill(); finish(null, 'Cancelled'); };
      const timer = setTimeout(() => { child.kill(); finish(null, 'Timed out'); }, timeout);
      signal?.addEventListener('abort', cancel, { once: true });
      child.stdout.on('data', data => { output = (output + data).slice(-400000); });
      child.stderr.on('data', data => { output = (output + data).slice(-400000); });
      child.once('error', () => finish(null, 'Could not launch local verification tool'));
      child.once('exit', code => finish(code));
    });
    await writeFile(path.join(directory, `${label}.log`), result.output);
    const check = { name: label, passed: result.code === 0, exitCode: result.code, elapsedMs: Math.round(performance.now() - begin), error: result.error };
    run.checks.push(check);
    if (signal?.aborted) throw new Error('Investigation cancelled.');
    return { ...check, output: result.output };
  }
  try {
    await update('context', 'Preparing an isolated iVoucher copy. Reproducing two known regressions for this demonstration.');
    for (const name of ['package.json', 'package-lock.json', 'tsconfig.base.json', 'apps/api/src', 'apps/api/test', 'apps/api/package.json', 'apps/api/tsconfig.json', 'apps/api/vitest.config.ts', 'apps/web/src', 'apps/web/public', 'apps/web/package.json', 'apps/web/tsconfig.json', 'apps/web/tsconfig.node.json', 'apps/web/vite.config.ts', 'apps/web/index.html', 'packages/shared']) {
      const from = path.join(projectRoot, name);
      try { await lstat(from); } catch { if (name === 'apps/web/public') continue; throw new Error(`Required project source is missing: ${name}`); }
      await mkdir(path.dirname(path.join(candidateRoot, name)), { recursive: true });
      await copySafe(from, path.join(candidateRoot, name));
    }
    await writeFile(run.files.baseline, baseline);
    await writeFile(run.files.candidate, baseline);
    await writeFile(path.join(candidateRoot, '.gitignore'), 'node_modules/\ndist/\n.release-detective/\n*.tsbuildinfo\n.env*\n');
    await mkdir(path.join(candidateRoot, '.release-detective'));
    await save(path.join(candidateRoot, '.release-detective/lab.json'), { synthetic: true, sourceHash: run.originalHash, changes: ['Removed route authentication', 'Removed public field projection'], allowedTarget: routeFile });
    await writeFile(path.join(candidateRoot, 'apps/api/test/release-detective.exposure.test.ts'), await readFile(path.join(runtime, 'fixtures/project-probes.ts')));
    // Reuse installed dependencies read-only; each local workspace package points at the COPY.
    const modules = path.join(candidateRoot, 'node_modules'); await mkdir(modules);
    for (const entry of await readdir(path.join(projectRoot, 'node_modules'), { withFileTypes: true })) {
      if (['@voucher', '.cache', '.vite', '.vite-temp'].includes(entry.name)) continue;
      if (entry.isDirectory() || entry.isSymbolicLink()) await symlink(path.join(projectRoot, 'node_modules', entry.name), path.join(modules, entry.name), 'junction');
    }
    await mkdir(path.join(modules, '@voucher'));
    for (const [name, target] of [['shared', 'packages/shared'], ['api', 'apps/api'], ['web', 'apps/web']]) await symlink(path.join(candidateRoot, target), path.join(modules, '@voucher', name), 'junction');
    // npm may keep version-specific dependencies inside a workspace package.
    for (const workspace of ['apps/api', 'apps/web', 'packages/shared']) {
      const sourceModules = path.join(projectRoot, workspace, 'node_modules');
      let entries;
      try { entries = await readdir(sourceModules, { withFileTypes: true }); } catch { continue; }
      const localModules = path.join(candidateRoot, workspace, 'node_modules');
      await mkdir(localModules, { recursive: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === '@voucher') continue;
        if (entry.isDirectory() || entry.isSymbolicLink()) await symlink(path.join(sourceModules, entry.name), path.join(localModules, entry.name), 'junction');
      }
    }
    const git = process.platform === 'win32' ? 'git.exe' : 'git';
    for (const [label, args] of [['git-init', ['init', '-b', 'codex/patch-ivoucher-demo']], ['git-stage', ['add', '.']], ['git-baseline', ['-c', 'user.name=Release Detective Lab', '-c', 'user.email=lab@example.invalid', 'commit', '-m', 'Controlled regression baseline with synthetic exposure checks']]]) {
      if (!(await execute(label, git, args, candidateRoot)).passed) throw new Error('Could not prepare the isolated review branch.');
    }
    const api = path.join(candidateRoot, 'apps/api');
    const vitest = path.join(modules, 'vitest/vitest.mjs');
    const probeFile = path.join(directory, 'baseline-probes.json');
    await update('detect', 'Testing both facility routes with anonymous, invalid, inactive and authorized identities.');
    await execute('baseline-probes', node, [vitest, 'run', 'test/release-detective.exposure.test.ts', '--maxWorkers=1'], api, { RD_PROBE_OUTPUT: probeFile });
    run.baseline = await json(probeFile);
    if (run.baseline.total !== 20 || run.baseline.passed !== 8) throw new Error('The controlled baseline did not reproduce the expected 12 failing checks.');
    const findings = [
      { id: 'AUTH-001', severity: 'critical', title: 'Facility route bypasses authentication and account authorization', action: 'require_authentication' },
      { id: 'DATA-001', severity: 'high', title: 'Facility response includes internal fields', action: 'minimize_response' }
    ];
    run.findings = findings;
    const context = { scenario: run.scope, policy: { authentication: 'Active validated JWT required', publicFields: ['id', 'code', 'name', 'type'], preserve: 'Existing staff role checks and admin access; headers and CORS already pass.' }, findings, checks: run.baseline.checks, goal: 'Select bounded local code repairs, then independently build and verify the isolated candidate. No source code or real records are supplied.' };
    await save(run.files.context, context);
    await update('reason', mode === 'demo' ? '12 HTTP checks failed. Selecting the two approved repairs with the offline playbook.' : '12 HTTP checks failed. Asking AI to choose repairs from two approved local code actions.');
    run.plan = mode === 'demo' ? validatePlan({ summary: 'Restore route authentication and public field projection.', rationale: 'The seeded route bypasses JWT/account checks and returns synthetic internal fields.', actions: findings.map(f => f.action), reviewNotes: 'Offline playbook. Review the real TypeScript diff; no deployment.' }, findings) : await openRouterPlan(context, { apiKey, model, signal });
    apiKey = '';
    await update('act', 'Applying the selected repairs to apps/api/src/app.ts in the isolated review branch.');
    const candidate = patchRoute(baseline, run.plan.actions);
    await writeFile(run.files.candidate, candidate); run.candidate = { sha256: digest(candidate) };
    const diff = await execute('code-diff', git, ['diff', '--', routeFile], candidateRoot);
    await writeFile(run.files.patch, diff.output);
    await update('verify', 'Building shared types, the API and the web app, then running the complete API test suite.');
    const build = await execute('application-build', node, [npm, 'run', 'build'], candidateRoot);
    const after = path.join(directory, 'candidate-probes.json');
    const tests = await execute('application-tests', node, [vitest, 'run', '--maxWorkers=1', '--reporter=json', `--outputFile=${path.join(directory, 'tests.json')}`], api, { RD_PROBE_OUTPUT: after });
    run.verification = await json(after);
    const testResults = await json(path.join(directory, 'tests.json'));
    run.testSummary = { passed: testResults.numPassedTests, failed: testResults.numFailedTests, total: testResults.numTotalTests, suites: testResults.numTotalTestSuites };
    await update('verify', 'Checking dependency advisories, source secrets and the final artifact hashes.');
    const audit = await execute('dependency-audit', node, [npm, 'audit', '--json', '--ignore-scripts', '--audit-level=high'], candidateRoot);
    const productionAudit = await execute('production-audit', node, [npm, 'audit', '--json', '--omit=dev', '--omit=optional', '--ignore-scripts', '--audit-level=moderate'], candidateRoot);
    for (const [name, result] of [['all', audit], ['production', productionAudit]]) {
      try { run.audits ??= {}; run.audits[name] = JSON.parse(result.output).metadata?.vulnerabilities || null; } catch { /* A missing result fails the gate below. */ }
    }
    run.secretScan = await sourceScan(candidateRoot);
    const originalUnchanged = digest(await read(path.join(projectRoot, routeFile))) === run.originalHash;
    const artifactUnchanged = digest(await read(run.files.candidate)) === run.candidate.sha256;
    run.integrity = { originalUnchanged, artifactUnchanged };
    const passed = build.passed && tests.passed && audit.passed && productionAudit.passed && run.audits?.all && run.audits?.production && run.secretScan.passed && originalUnchanged && artifactUnchanged && run.verification.total === 20 && run.verification.passed === 20;
    run.gate = passed ? 'PASS' : 'HOLD'; run.status = passed ? 'review_required' : 'blocked';
    const blockers = [!build.passed && 'application build', !tests.passed && 'API tests', (!audit.passed || !productionAudit.passed) && 'dependency advisories', !run.secretScan.passed && 'secret scan', (!originalUnchanged || !artifactUnchanged) && 'artifact integrity'].filter(Boolean);
    run.blockers = blockers;
    await update('report', passed ? '20/20 exposure checks pass. Application build and test suite passed. Review the TypeScript diff before any promotion.' : `Release on HOLD: ${blockers.join(', ') || 'incomplete verification'}. Review the code fix and the evidence before promotion.`);
  } catch (error) {
    run.gate = 'HOLD'; run.status = signal?.aborted ? 'cancelled' : 'failed'; run.error = error.message;
    await update('failed', error.message);
  }
  run.timing = { elapsedMs: Math.round(performance.now() - started) };
  run.completedAt = new Date().toISOString();
  await writeFile(run.files.report, projectReport(run));
  await save(run.files.evidence, run);
  onUpdate(structuredClone(run));
  return run;
}

export function projectReport(run) {
  return `# Patch investigation - iVoucher code candidate\n\nGate: **${run.gate}** | Human review required\n\n${run.scope}\n\nThe working project was already protected. This lab deliberately removed two controls, then repaired them.\n\n## Before and after\n\n- Baseline: ${run.baseline ? run.baseline.total - run.baseline.passed : '?'} failing exposure checks.\n- Candidate: ${run.verification?.passed ?? '?'}/${run.verification?.total ?? '?'} exposure checks passed.\n- Full API suite: ${run.testSummary?.passed ?? '?'}/${run.testSummary?.total ?? '?'} tests passed.\n- Measured engine time: ${(run.timing.elapsedMs / 1000).toFixed(1)} seconds. Human review excluded.\n- Original source unchanged: ${run.integrity?.originalUnchanged ?? 'not verified'}.\n\n## AI contribution\n\n${run.mode === 'demo' ? 'Offline playbook (not an AI response).' : 'AI selected bounded repairs from sanitized probe evidence. Local tools applied the patch; independent checks determined the gate.'}\n\n${run.plan?.summary || run.error || ''}\n\n## Verification\n\n${run.checks.filter(c => !c.name.startsWith('git-')).map(c => `- ${c.passed ? 'PASS' : 'FAIL'}: ${c.name} (${(c.elapsedMs / 1000).toFixed(1)}s)`).join('\n')}\n- Source secret scan: ${run.secretScan?.passed ? 'PASS' : 'not passed'} (${run.secretScan?.files ?? '?'} files).\n- Dependency advisory totals: ${JSON.stringify(run.audits || {})}.\n\n## Limits and review\n\nOnly the facilities exposure recipe is automated. Database calls use synthetic mocks; infrastructure, real data, production and other routes are outside this exposure-test scope. Existing API regression tests also run. Dependencies are reused from the local install; the lockfile is audited. Full audit blocks high/critical issues; production audit also blocks moderate issues. Lower-severity development advisories may remain. Secret scanning is pattern based.\n\nInspect fix.patch and the full app.ts diff. No commit, merge or deployment of the repair is automatic. Current model transport is temporary; Galileo integration remains required before an event submission claiming Galileo use. No source code, credentials or real records were sent to the model.\n`;
}

export async function verifyProjectArtifacts(run) {
  if (!run.candidate || digest(await read(run.files.candidate)) !== run.candidate.sha256) throw new Error('Candidate changed after verification. Run the checks again before reviewing it as verified.');
  return run.files;
}
