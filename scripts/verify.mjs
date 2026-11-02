import { spawnSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { ROOT } from '../src/config.mjs';
import { securityCheck } from './security.mjs';

const execute = args => {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', timeout: 90000 });
  if (result.error || result.status !== 0) throw new Error(`Verification command failed: ${args[0]}`);
};
try {
  await mkdir(path.join(ROOT, 'data'), { recursive: true });
  await writeFile(path.join(ROOT, 'data', 'build-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), gate: 'HOLD', reason: 'Build verification has not completed.' }, null, 2));
  for (const dir of ['src', 'scripts', 'public', 'companion', 'companion/lib']) {
    for (const file of await readdir(path.join(ROOT, dir))) if (/\.(mjs|cjs|js)$/.test(file)) execute(['--check', path.join(dir, file)]);
  }
  const security = await securityCheck();
  console.log(JSON.stringify(security, null, 2));
  if (!security.passed) throw new Error('Source security checks failed.');
  // npm supplies its CLI path; use Node directly so PowerShell script policy is irrelevant.
  if (!process.env.npm_execpath) throw new Error('Run this gate through npm.cmd run build so the dependency audit is available.');
  execute([process.env.npm_execpath, 'audit', '--omit=dev', '--audit-level=low', '--ignore-scripts']);
  execute([process.env.npm_execpath, 'audit', '--prefix', 'companion', '--omit=dev', '--audit-level=low', '--ignore-scripts']);
  const tests = (await readdir(path.join(ROOT, 'test'))).filter(name => name.endsWith('.test.mjs')).map(name => path.join('test', name));
  execute(['--test', '--test-isolation=none', ...tests]);
  const companionTests = (await readdir(path.join(ROOT, 'companion/test'))).filter(name => name.endsWith('.test.cjs')).map(name => path.join('companion/test', name));
  execute(['--test', '--test-isolation=none', ...companionTests]);
  const bundledPython = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
  const python = process.env.RD_PYTHON || (existsSync(bundledPython) ? bundledPython : 'python');
  const native = spawnSync(python, ['companion/native/pet.py', '--self-test'], { cwd: ROOT, stdio: 'inherit', timeout: 15000, windowsHide: true });
  if (native.error || native.status !== 0) throw new Error('Native companion checks failed. Set RD_PYTHON to a Python installation with tkinter.');
  await mkdir(path.join(ROOT, 'data'), { recursive: true });
  await writeFile(path.join(ROOT, 'data', 'build-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), gate: 'PASS', security, scope: 'Release Detective and companion only. Syntax, both dependency audits, source secret scan, provider contract and local HTTP security tests, native pet widget checks. Real VS Code integration is recorded separately.' }, null, 2));
  console.log('Build gate PASS. This local prototype is ready to run. No deployment performed.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
