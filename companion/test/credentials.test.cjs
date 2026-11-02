'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { resolveOpenRouterKey } = require('../lib/credentials.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rd-credentials-'));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.match(path.basename(resolved), /^rd-credentials-/);
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const project = path.join(root, 'release-detective');
  await fs.mkdir(path.join(project, 'companion', 'examples'), { recursive: true });
  const key = ['synthetic', 'fixture', 'key'].join('-');
  await fs.writeFile(path.join(project, '.env'), `OPENROUTER_API_KEY="${key}"\n`);
  return { root, project, key, file: path.join(project, 'companion', 'examples', 'security-demo.js') };
}

test('a single file with no workspace resolves the existing project key and rereads edits', async t => {
  const { project, key, file } = await fixture(t);
  assert.equal(await resolveOpenRouterKey({ activeFile: file }), key);
  await fs.writeFile(path.join(project, '.env'), 'OPENROUTER_API_KEY=updated-synthetic-value\n');
  assert.equal(await resolveOpenRouterKey({ activeFile: file }), 'updated-synthetic-value');
});

test('workspace roots, untitled documents and nested project folders resolve the key', async t => {
  const { root, project, key, file } = await fixture(t);
  for (const folder of [root, project]) {
    assert.equal(await resolveOpenRouterKey({ workspaceFolders: [folder] }), key);
    assert.equal(await resolveOpenRouterKey({ activeFile: file, workspaceFolders: [folder] }), key);
  }
  assert.equal(await resolveOpenRouterKey({ activeFile: file, workspaceFolders: [path.join(project, 'companion')] }), key);
});

test('file-only lookup respects Git boundaries and does not borrow an unrelated workspace key', async t => {
  const { root, project } = await fixture(t);
  const other = path.join(root, 'other-project');
  await fs.mkdir(path.join(other, '.git'), { recursive: true });
  const activeFile = path.join(other, 'service.js');
  assert.equal(await resolveOpenRouterKey({ activeFile, workspaceFolders: [project, root] }), '');
  // Git worktrees use a .git file rather than a directory.
  const worktree = path.join(root, 'worktree');
  await fs.mkdir(worktree);
  await fs.writeFile(path.join(worktree, '.git'), 'gitdir: elsewhere');
  assert.equal(await resolveOpenRouterKey({ activeFile: path.join(worktree, 'service.js'), workspaceFolders: [root] }), '');
});

test('credential precedence is preserved and unsupported or missing contexts return no key', async () => {
  assert.equal(await resolveOpenRouterKey({ storedKey: ' saved ', environmentKey: 'env' }), 'saved');
  assert.equal(await resolveOpenRouterKey({ environmentKey: ' env ' }), 'env');
  assert.equal(await resolveOpenRouterKey(), '');
  assert.equal(await resolveOpenRouterKey({ activeFile: 'untitled.js', workspaceFolders: ['relative'] }), '');
});

test('a GitHub checkout with a different folder name resolves only its own project key', async t => {
  const { root, project, key } = await fixture(t);
  const checkout = path.join(root, 'devxarena2026-naija-ai-build');
  await fs.rename(project, checkout);
  await fs.writeFile(path.join(checkout, 'package.json'), JSON.stringify({ name: 'release-detective' }));
  await fs.mkdir(path.join(checkout, '.git'));
  const activeFile = path.join(checkout, 'companion', 'examples', 'security-demo.js');
  assert.equal(await resolveOpenRouterKey({ activeFile }), key);
  assert.equal(await resolveOpenRouterKey({ workspaceFolders: [checkout] }), key);
  await fs.writeFile(path.join(checkout, 'package.json'), JSON.stringify({ name: 'unrelated-project' }));
  assert.equal(await resolveOpenRouterKey({ activeFile }), '');
});

test('neutral env key takes precedence and a blank value preserves existing configuration', async t => {
  const { project, file } = await fixture(t);
  const envFile = path.join(project, '.env');
  await fs.writeFile(envFile, 'OPENROUTER_API_KEY=legacy-test-value\nAI_API_KEY="neutral-test-value"\n');
  assert.equal(await resolveOpenRouterKey({ activeFile: file }), 'neutral-test-value');
  await fs.writeFile(envFile, 'AI_API_KEY=\nOPENROUTER_API_KEY=legacy-test-value\n');
  assert.equal(await resolveOpenRouterKey({ activeFile: file }), 'legacy-test-value');
});
