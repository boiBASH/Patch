import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { seedRegression, patchRoute, verifyProjectArtifacts, canonicalDrive } from '../src/project-lab.mjs';

test('VS Code drive spelling matches Vite module identities without changing path content', () => {
  assert.equal(canonicalDrive('c:/Users/Example/project'), 'C:/Users/Example/project');
  assert.equal(canonicalDrive('C:/Users/Example/project'), 'C:/Users/Example/project');
  assert.equal(canonicalDrive('/tmp/project'), '/tmp/project');
});

const source = 'apiRouter.get("/facilities", authenticate, async (_req, res, next) => {\n        where: {\n          onboardingStatus: "APPROVED"\n        },\n        select: publicFacilitySelect,\n});\n';
test('isolated regression plus bounded repairs restores the original source exactly', () => {
  const baseline = seedRegression(source);
  assert.equal(patchRoute(baseline, ['require_authentication', 'minimize_response']), source);
  assert.notEqual(baseline, source);
});
test('project recipe fails closed on changed, duplicated, repeated or unsupported edits', () => {
  assert.throws(() => seedRegression('unrelated project'));
  assert.throws(() => seedRegression(source + source));
  assert.throws(() => patchRoute(source, ['require_authentication']));
  assert.throws(() => patchRoute(source, ['restrict_roles']));
  assert.throws(() => patchRoute(seedRegression(source), ['minimize_response', 'minimize_response']));
});
test('review refuses a code candidate modified after verification', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rd-project-integrity-'));
  const candidate = path.join(directory, 'app.ts');
  await writeFile(candidate, source);
  const run = { candidate: { sha256: createHash('sha256').update(source).digest('hex') }, files: { candidate } };
  assert.equal((await verifyProjectArtifacts(run)).candidate, candidate);
  await writeFile(candidate, seedRegression(source));
  await assert.rejects(verifyProjectArtifacts(run), /changed after verification/);
  assert.notEqual(await readFile(candidate, 'utf8'), source);
});
