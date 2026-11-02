'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.run = async () => {
  const live = process.env.RD_LIVE_INVESTIGATION === '1';
  const output = path.join(__dirname, '../../data', live ? 'connected-demo-verification.json' : 'connected-offline-verification.json');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ status: 'RUNNING', date: new Date().toISOString() }));
  try {
    const extension = vscode.extensions.getExtension('naija-ai.release-detective-companion');
    assert.ok(extension);
    const api = await extension.activate();
    assert.ok(api);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(__dirname, '../examples/security-demo.js')));
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('releaseDetective.scan');
    await vscode.commands.executeCommand('releaseDetective.showPet');
    for (let count = 0; count < 50 && !api.snapshot().petConnected; count++) await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(api.snapshot().petConnected, true);
    const started = performance.now();
    const run = await vscode.commands.executeCommand(live ? 'releaseDetective.investigate' : 'releaseDetective.demo');
    const commandElapsedMs = Math.round(performance.now() - started);
    assert.equal(run.gate, 'PASS');
    assert.equal(run.status, 'review_required');
    assert.equal(run.baseline.total - run.baseline.passed, 32);
    assert.equal(run.verification.passed, 36);
    assert.equal(run.patch.length, 5);
    assert.equal(run.reasoningContext.checks.length, 36);
    assert.deepEqual(run.events.map(event => event.stage), ['context', 'detect', 'reason', 'act', 'verify', 'report']);
    assert.equal(api.snapshot().investigation.id, run.id);
    assert.equal(api.snapshot().investigation.reviewReady, true);
    await vscode.commands.executeCommand('releaseDetective.review');
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
    assert.ok(tabs.some(tab => tab.input instanceof vscode.TabInputTextDiff), 'Review must open the actual before/after diff');
    assert.ok(vscode.window.visibleTextEditors.some(editor => editor.document.fileName.endsWith('report.md')), 'Review must open the evidence report');
    await fs.writeFile(path.join(path.dirname(output), live ? 'connected-demo-run.json' : 'connected-offline-run.json'), JSON.stringify(run, null, 2));
    await fs.writeFile(output, JSON.stringify({ status: 'PASS', version: extension.packageJSON.version, provider: run.mode, model: run.model, runId: run.id, nativePetConnection: 'PASS', acceptanceChecks: 5, baselineFailed: 32, candidatePassed: 36, candidateTotal: 36, patchOperations: 5, diffAndReportOpened: true, commandElapsedMs, engineTiming: run.timing, date: new Date().toISOString(), scope: 'Packaged extension, native pet, sandbox HTTP checks, AI plan, saved candidate, unchanged verifier and VS Code review. No production system contacted.' }, null, 2));
  } catch (error) {
    await fs.writeFile(output, JSON.stringify({ status: 'FAILED', error: error.message, date: new Date().toISOString() }, null, 2));
    throw error;
  } finally {
    await vscode.commands.executeCommand('releaseDetective.hidePet');
  }
};
