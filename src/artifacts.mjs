import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { hash } from './policy.mjs';
import { markdownReport } from './agent.mjs';

export function artifactPaths(run, dataDir) {
  if (!path.isAbsolute(dataDir) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(run.id)) throw new Error('Invalid local artifact location.');
  const directory = path.join(dataDir, run.id);
  return Object.fromEntries(Object.entries({ directory: '', baseline: 'baseline-policy.json', candidate: 'candidate-policy.json', patch: 'patch.json', report: 'report.md', evidence: 'evidence.json', context: 'model-context.json' }).map(([key, file]) => [key, file ? path.join(directory, file) : directory]));
}

const json = value => JSON.stringify(value, null, 2) + '\n';
export async function materializeCandidate(run, dataDir) {
  const files = artifactPaths(run, dataDir);
  await mkdir(files.directory, { recursive: true });
  await writeFile(files.baseline, json(run.source.policy), { flag: 'wx', mode: 0o600 });
  await writeFile(files.candidate, json(run.candidate.policy), { flag: 'wx', mode: 0o600 });
  await writeFile(files.patch, json(run.patch), { flag: 'wx', mode: 0o600 });
  return JSON.parse(await readFile(files.candidate, 'utf8'));
}

export async function writeEvidence(run, dataDir) {
  const files = artifactPaths(run, dataDir);
  await mkdir(files.directory, { recursive: true });
  await writeFile(files.report, markdownReport(run), { mode: 0o600 });
  await writeFile(files.evidence, json(run), { mode: 0o600 });
  if (run.reasoningContext) await writeFile(files.context, json(run.reasoningContext), { mode: 0o600 });
  return files;
}

export async function verifyArtifactIntegrity(run, dataDir) {
  const files = artifactPaths(run, dataDir);
  if (!run.candidate) throw new Error('This investigation did not produce a candidate. Open its evidence instead.');
  try {
    const baseline = JSON.parse(await readFile(files.baseline, 'utf8'));
    const candidate = JSON.parse(await readFile(files.candidate, 'utf8'));
    if (hash(baseline) !== run.source.hash || hash(candidate) !== run.candidate.hash) throw new Error('Changed');
  } catch { throw new Error('The saved candidate or baseline changed since verification. Run a fresh investigation before reviewing it.'); }
  return files;
}
