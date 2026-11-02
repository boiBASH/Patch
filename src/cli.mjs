import { loadConfig } from './config.mjs';
import { createRun, investigate } from './agent.mjs';

const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'demo';
const config = loadConfig();
const run = await investigate(createRun(mode, config.model), config);
console.log(JSON.stringify({ id: run.id, mode, gate: run.gate, status: run.status, findings: run.baseline?.findings.length, checks: run.verification ? `${run.verification.passed}/${run.verification.total}` : 'incomplete', error: run.error }, null, 2));
process.exitCode = run.gate === 'PASS' ? 0 : 1;
