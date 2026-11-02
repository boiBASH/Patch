'use strict';
// Opt-in only: one paid, generic explanation through a real VS Code extension host.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.run = async () => {
  assert.equal(process.env.RD_LIVE_AI_TEST, '1', 'Live inference requires explicit opt-in');
  const singleFile = process.env.RD_LIVE_AI_SINGLE_FILE === '1';
  const resultFile = path.join(__dirname, singleFile ? '../../data/companion-vscode-single-file-ai.json' : '../../data/companion-vscode-live-ai.json');
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  await fs.writeFile(resultFile, JSON.stringify({ status: 'RUNNING', date: new Date().toISOString() }));
  try {
    const extension = vscode.extensions.getExtension('naija-ai.release-detective-companion');
    assert.ok(extension, 'Extension must be available');
    const api = await extension.activate();
    assert.ok(api, 'Extension must activate in a trusted local workspace');
    if (singleFile) {
      assert.equal(vscode.workspace.workspaceFolders?.length || 0, 0, 'Reproduce a file-only window with no open project');
      assert.ok(!process.env.OPENROUTER_API_KEY, 'The regression must resolve the file rather than an inherited key');
    }
    const document = singleFile
      ? await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(__dirname, '../examples/security-demo.js')))
      : await vscode.workspace.openTextDocument({ language: 'javascript', content: 'router.get("/facilities", handler);\n' });
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('releaseDetective.scan');
    assert.equal(api.snapshot().finding.rule, singleFile ? 'cors' : 'auth');
    await vscode.commands.executeCommand('releaseDetective.explain');
    const result = api.snapshot();
    assert.equal(result.explaining, false);
    assert.ok(result.explanation.length > 40, 'Explanation must contain text');
    assert.doesNotMatch(result.explanation, /^(Could not reach|AI service returned|AI service did not|Add your key|Choose a valid)/, result.explanation);
    await fs.writeFile(resultFile, JSON.stringify({ status: 'PASS', scope: singleFile ? 'Real VS Code Explain command in a file-only window with no workspace, generic CORS advice only' : 'Real VS Code Explain command, generic authentication advice only', responseCharacters: result.explanation.length, date: new Date().toISOString() }, null, 2));
  } catch (error) {
    await fs.writeFile(resultFile, JSON.stringify({ status: 'FAILED', error: error.message, date: new Date().toISOString() }, null, 2));
    throw error;
  }
};
