'use strict';
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.run = async () => {
  const resultFile = path.join(__dirname, '../../data/companion-vscode-verification.json');
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  await fs.writeFile(resultFile, JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }));
  try {
  const extension = vscode.extensions.getExtension('naija-ai.release-detective-companion');
  assert.ok(extension, 'VS Code must discover the extension');
  const api = await extension.activate();
  assert.ok(api, 'The trusted local extension must activate');
  const document = await vscode.workspace.openTextDocument({ language: 'javascript', content: 'app.use(cors());\nrouter.get("/facilities", handler);\nconst rows = prisma.facility.findMany();\n' });
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('releaseDetective.scan');
  const snapshot = api.snapshot();
  const diagnostics = vscode.languages.getDiagnostics(document.uri).filter(item => item.source === 'Release Detective');
  assert.equal(snapshot.count, 3);
  assert.equal(diagnostics.length, 3);
  assert.ok(snapshot.finding.tip);
  assert.equal(JSON.stringify(snapshot).includes('app.use(cors())'), false);
  await vscode.commands.executeCommand('releaseDetective.showPet');
  let connected = false;
  for (let count = 0; count < 50; count++) {
    if (api.snapshot().petConnected) { connected = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(connected, 'The native pet must launch and authenticate to the live extension bridge');
  await vscode.commands.executeCommand('releaseDetective.hidePet');
  await fs.mkdir(path.join(__dirname, '../../data'), { recursive: true });
  await fs.writeFile(path.join(__dirname, '../../data/companion-vscode-verification.json'), JSON.stringify({ extensionActivation: 'PASS', activeFileScan: 'PASS', diagnostics: diagnostics.length, sourceContentExcluded: true, nativePetConnection: 'PASS', date: new Date().toISOString() }, null, 2));
  } catch (error) {
    await fs.writeFile(resultFile, JSON.stringify({ status: 'FAILED', error: error.message, date: new Date().toISOString() }, null, 2));
    throw error;
  }
};
