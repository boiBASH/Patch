'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function createInvestigationController({ runtimeRoot, dataDir, credentials, onUpdate = () => {}, fetchImpl }) {
  const engine = await import(pathToFileURL(path.join(runtimeRoot, 'src/agent.mjs')).href);
  const artifacts = await import(pathToFileURL(path.join(runtimeRoot, 'src/artifacts.mjs')).href);
  const providers = await import(pathToFileURL(path.join(runtimeRoot, 'src/providers.mjs')).href);
  const project = await import(pathToFileURL(path.join(runtimeRoot, 'src/project-lab.mjs')).href);
  let current = null, pending = null, abort = null, closed = false;
  let lastStarted = 0;

  function snapshot() {
    if (!current) return null;
    return {
      id: current.id, status: current.status, stage: current.stage, gate: current.gate,
      busy: Boolean(pending) || current.status === 'running',
      provider: current.mode === 'demo' ? 'Offline playbook' : 'AI investigation',
      message: current.error || current.events.at(-1)?.message || 'Preparing the sandbox investigation.',
      summary: current.plan?.summary || '',
      baselineFailures: current.baseline ? current.baseline.total - current.baseline.passed : null,
      passed: current.verification?.passed ?? null, total: current.verification?.total ?? null,
      elapsedMs: current.timing?.elapsedMs ?? 0,
      reviewReady: Boolean(current.candidate && !pending && current.status !== 'running'),
      reportReady: !pending && current.status !== 'running', scope: current.kind === 'ivoucher-project-lab' ? 'Isolated iVoucher copy · synthetic records · no deployment.' : 'Synthetic API only. Human review required.'
    };
  }

  function start(mode = 'openrouter', projectRoot = null) {
    if (!['openrouter', 'demo'].includes(mode)) return Promise.reject(new Error('Unsupported investigation mode.'));
    if (closed) return Promise.reject(new Error('The companion is closing.'));
    if (pending) return pending;
    if (Date.now() - lastStarted < 3000) return Promise.reject(new Error('Wait a moment before another investigation.'));
    lastStarted = Date.now();
    current = engine.createRun(mode, 'pending');
    abort = new AbortController();
    onUpdate(snapshot());
    pending = (async () => {
      let config;
      try {
        const resolved = mode === 'demo' ? { apiKey: '', model: 'Deterministic demo' } : await credentials();
        config = { ...resolved, dataDir, signal: abort.signal };
        current.model = mode === 'demo' ? 'Deterministic demo' : resolved.model;
        if (projectRoot) {
          current = await project.investigateProject({ ...config, mode, projectRoot,
            outputRoot: path.join(projectRoot, 'release-detective', 'data', 'project-runs'),
            onUpdate: value => { current = value; onUpdate(snapshot()); }
          });
          return structuredClone(current);
        }
        await engine.investigate(current, config, {
          planner: context => providers.planWithProvider(mode, context, config, fetchImpl),
          materializeCandidate: run => artifacts.materializeCandidate(run, dataDir),
          persist: async run => { await engine.saveRun(run, dataDir); onUpdate(snapshot()); }
        });
        await artifacts.writeEvidence(current, dataDir);
      } catch {
        current.gate = 'HOLD'; current.status = 'failed'; current.stage = 'failed';
        current.error = 'Investigation could not complete or save its evidence. Check local storage and configuration, then run again.';
        await engine.saveRun(current, dataDir).catch(() => {});
        await artifacts.writeEvidence(current, dataDir).catch(() => {});
      } finally {
        config = null; pending = null; abort = null; onUpdate(snapshot());
      }
      return structuredClone(current);
    })();
    return pending;
  }

  return {
    start, snapshot,
    latestRun: () => current ? structuredClone(current) : null,
    review: async () => {
      if (!current || pending) throw new Error('Finish a sandbox investigation first.');
      try { return current.kind === 'ivoucher-project-lab' ? await project.verifyProjectArtifacts(current) : await artifacts.verifyArtifactIntegrity(current, dataDir); }
      catch (error) {
        current.gate = 'HOLD'; current.status = 'blocked'; current.error = error.message;
        if (current.kind !== 'ivoucher-project-lab') { await engine.saveRun(current, dataDir); await artifacts.writeEvidence(current, dataDir); }
        onUpdate(snapshot()); throw error;
      }
    },
    files: () => current ? current.kind === 'ivoucher-project-lab' ? current.files : artifacts.artifactPaths(current, dataDir) : null,
    cancel: () => abort?.abort(),
    dispose: () => { closed = true; abort?.abort(); }
  };
}

module.exports = { createInvestigationController };
