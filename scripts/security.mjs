import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../src/config.mjs';

const patterns = [
  ['OpenRouter credential', /sk-or-v1-[A-Za-z0-9_-]{24,}/],
  ['API credential', /sk-(?:proj-|live-)?[A-Za-z0-9_-]{32,}/],
  ['AWS access key', /AKIA[A-Z0-9]{16}/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['Assigned secret', /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9/+_-]{24,}["']/i]
];

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'data', '.git'].includes(entry.name) || entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in the prototype source tree.');
    if (entry.isDirectory()) result.push(...await sourceFiles(file));
    else if (/\.(?:mjs|cjs|js|ts|tsx|py|json|html|css|md|ya?ml|example)$/.test(entry.name)) result.push(file);
  }
  return result;
}

export async function securityCheck(root = ROOT) {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const dependencyCount = ['dependencies', 'devDependencies', 'optionalDependencies'].reduce((count, key) => count + Object.keys(manifest[key] || {}).length, 0);
  const lockedPackages = Object.keys(lock.packages || {}).filter(key => key !== '');
  const findings = [];
  if (dependencyCount || lockedPackages.length) findings.push({ rule: 'dependency-inventory', file: 'package.json', message: 'This dependency-free prototype has acquired packages. Review and update its audit policy.' });
  const files = await sourceFiles(root);
  for (const file of files.filter(file => path.basename(file) === 'package.json')) {
    const child = JSON.parse(await readFile(file, 'utf8'));
    if (['dependencies', 'devDependencies', 'optionalDependencies'].some(key => Object.keys(child[key] || {}).length)) findings.push({ rule: 'dependency-inventory', file: path.relative(root, file), message: 'Review new companion dependencies.' });
  }
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [rule, pattern] of patterns) if (pattern.test(line)) findings.push({ rule, file: path.relative(root, file), line: i + 1 });
    });
  }
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  if (!ignore.split(/\r?\n/).includes('.env')) findings.push({ rule: 'secret-exclusion', file: '.gitignore' });
  return { passed: findings.length === 0, sourceFilesScanned: files.length, dependencyCount, lockedPackages: lockedPackages.length, findings, scope: 'Prototype source only; local .env and generated reports excluded. Pattern-based secret detection is not exhaustive.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await securityCheck();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
