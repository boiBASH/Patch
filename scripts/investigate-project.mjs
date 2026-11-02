import path from 'node:path';
import { investigateProject } from '../src/project-lab.mjs';
import { loadConfig, ROOT } from '../src/config.mjs';
const config = await loadConfig();
const mode = process.argv.includes('--offline') ? 'demo' : 'openrouter';
// A standalone checkout can inspect an explicitly supplied, locally authorized iVoucher checkout.
const rootOption = process.argv.indexOf('--project-root');
if (rootOption !== -1 && (!process.argv[rootOption + 1] || process.argv[rootOption + 1].startsWith('--'))) {
  throw new Error('--project-root requires the path to your local iVoucher checkout.');
}
const projectRoot = rootOption === -1 ? path.dirname(ROOT) : path.resolve(process.argv[rootOption + 1]);
const run = await investigateProject({ projectRoot, outputRoot: path.join(ROOT, 'data/project-runs'), ...config, mode,
  onUpdate: value => console.log(JSON.stringify({ id: value.id, stage: value.stage, gate: value.gate, message: value.events.at(-1)?.message })) });
console.log(JSON.stringify({ gate: run.gate, report: run.files.report, evidence: run.files.evidence }));
process.exitCode = run.gate === 'PASS' ? 0 : 1;
