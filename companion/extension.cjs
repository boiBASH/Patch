'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { analyze, eligible, RULES, IDLE_TIPS } = require('./lib/rules.cjs');
const { createBridge } = require('./lib/bridge.cjs');
const { explainRule } = require('./lib/ai.cjs');
const { resolveOpenRouterKey } = require('./lib/credentials.cjs');
const { createInvestigationController } = require('./lib/investigation.cjs');

async function activate(context) {
  if (!vscode.workspace.isTrusted || vscode.env.remoteName) return;
  const diagnostics = vscode.languages.createDiagnosticCollection('release-detective');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  status.command = 'releaseDetective.showPet'; status.text = '$(shield) Patch';
  status.tooltip = 'Release Detective: show Patch, your coding and security companion'; status.show();
  let document = null, findings = [], index = 0, revision = 0, snoozedUntil = 0;
  let explanation = '', explaining = false, lastExplain = 0, child = null, timer, lastPetPoll = 0;
  let focus = vscode.window.state.focused;
  let showInvestigation = false, credentialFile = '';
  let projectRoot = '';
  for (const folder of vscode.workspace.workspaceFolders || []) {
    if (folder.uri.scheme !== 'file') continue;
    try {
      await fs.stat(path.join(folder.uri.fsPath, 'apps/api/src/app.ts'));
      await fs.stat(path.join(folder.uri.fsPath, 'release-detective/package.json'));
      projectRoot = folder.uri.fsPath; break;
    } catch { /* The project lab recipe is available only in its trusted local project. */ }
  }
  async function credentials() {
    const apiKey = await resolveOpenRouterKey({
      storedKey: await context.secrets.get('openrouterKey') || '',
      environmentKey: process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || '',
      activeFile: credentialFile,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath)
    });
    const model = vscode.workspace.getConfiguration('releaseDetective').get('model', 'openai/gpt-4.1-mini');
    return { apiKey, model };
  }
  const packagedRuntime = path.join(context.extensionPath, 'runtime');
  let runtimeRoot = packagedRuntime;
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    try { await fs.stat(path.join(packagedRuntime, 'src/agent.mjs')); }
    catch { runtimeRoot = path.dirname(context.extensionPath); }
  }
  const investigation = await createInvestigationController({
    runtimeRoot, dataDir: path.join(context.globalStorageUri.fsPath, 'investigations'), credentials,
    onUpdate: () => { revision++; }
  });

  function snapshot() {
    const finding = findings[index] || null;
    return {
      revision, focused: focus, file: document ? path.basename(document.fileName) : '',
      petConnected: lastPetPoll > 0 && Date.now() - lastPetPoll < 5000,
      count: findings.length, finding, index, explaining, explanation,
      investigation: investigation.snapshot(), showInvestigation, projectAvailable: Boolean(projectRoot),
      snoozed: Date.now() < snoozedUntil,
      tip: finding?.tip || IDLE_TIPS[Math.floor(Date.now() / 90000) % IDLE_TIPS.length],
      mode: 'Local heuristics', message: !document ? 'Woof! I am Patch. Open a supported source file and I will help you review common security risks.' : ''
    };
  }

  function scan(editor = vscode.window.activeTextEditor) {
    if (!editor || !['file', 'untitled'].includes(editor.document.uri.scheme)) {
      document = null; findings = []; index = 0; explanation = ''; diagnostics.clear(); revision++; return;
    }
    const current = editor.document;
    const storageRelative = path.relative(context.globalStorageUri.fsPath, current.fileName);
    const isArtifact = current.uri.scheme === 'file' && !path.isAbsolute(storageRelative) && storageRelative !== '..' && !storageRelative.startsWith('..' + path.sep);
    const text = current.getText();
    const supported = !isArtifact && eligible(current.fileName, current.languageId, text.length);
    if (!isArtifact) credentialFile = supported && current.uri.scheme === 'file' ? current.uri.fsPath : '';
    document = supported ? current : null;
    findings = supported ? analyze(text, current.languageId, current.fileName) : [];
    index = 0; explanation = ''; revision++; diagnostics.clear();
    if (supported) diagnostics.set(current.uri, findings.map(finding => {
      const range = new vscode.Range(finding.line, finding.character, finding.line, Math.min(current.lineAt(finding.line).text.length, finding.character + 12));
      const severity = finding.severity === 'review' ? vscode.DiagnosticSeverity.Information : vscode.DiagnosticSeverity.Warning;
      const diagnostic = new vscode.Diagnostic(range, `${finding.title}. ${finding.tip} (Heuristic: verify context.)`, severity);
      diagnostic.source = 'Release Detective'; diagnostic.code = finding.rule; return diagnostic;
    }));
    status.text = findings.length ? `$(shield) Patch: ${findings.length}` : '$(shield) Patch';
  }

  async function jump() {
    const finding = findings[index];
    if (!document || !finding || document.isClosed) return;
    const editor = await vscode.window.showTextDocument(document, { preserveFocus: false });
    const position = new vscode.Position(finding.line, finding.character);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  async function explain() {
    if (explaining || investigation.snapshot()?.busy || Date.now() - lastExplain < 3000 || !findings[index]) return;
    showInvestigation = false;
    explaining = true; lastExplain = Date.now(); explanation = ''; revision++;
    const rule = findings[index].rule, requestedRevision = revision;
    try {
      const { apiKey, model } = await credentials();
      const answer = await explainRule(rule, apiKey, model);
      if (revision === requestedRevision) explanation = answer;
    } catch (error) { if (revision === requestedRevision) explanation = error.message; }
    finally { explaining = false; revision++; }
  }

  async function startInvestigation(mode = 'openrouter') {
    if (explaining) { vscode.window.showInformationMessage('Wait for the explanation to finish before starting an investigation.'); return; }
    showInvestigation = true; snoozedUntil = 0; revision++;
    try { return await investigation.start(mode); }
    catch (error) { vscode.window.showErrorMessage(error.message); }
  }

  async function reviewFix() {
    try {
      const files = await investigation.review();
      await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(files.baseline), vscode.Uri.file(files.candidate), 'Patch: candidate fix - human review required', { preview: false });
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(files.report), { viewColumn: vscode.ViewColumn.Beside, preview: false });
    } catch (error) { vscode.window.showWarningMessage(error.message); }
  }

  async function startProjectInvestigation() {
    if (!projectRoot) { vscode.window.showWarningMessage('Open the trusted iVoucher workspace to investigate an isolated project copy.'); return; }
    if (explaining) return;
    credentialFile = path.join(projectRoot, 'apps/api/src/app.ts');
    showInvestigation = true; snoozedUntil = 0; revision++;
    try { return await investigation.start('openrouter', projectRoot); }
    catch (error) { vscode.window.showErrorMessage(error.message); }
  }

  async function openEvidence() {
    const files = investigation.files();
    if (!files || !investigation.snapshot()?.reportReady) return;
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(files.evidence), { preview: false });
  }

  async function action(name) {
    if (name === 'next') { showInvestigation = false; index = findings.length ? (index + 1) % findings.length : 0; explanation = ''; revision++; }
    else if (name === 'jump') await jump();
    else if (name === 'explain') void explain();
    else if (name === 'snooze') { snoozedUntil = Date.now() + 15 * 60 * 1000; revision++; }
    else if (name === 'wake') { snoozedUntil = 0; revision++; }
    else if (name === 'investigate') void (projectRoot ? startProjectInvestigation() : startInvestigation());
    else if (name === 'demo') void startInvestigation('demo');
    else if (name === 'review') void reviewFix();
    else if (name === 'evidence') void openEvidence().catch(() => vscode.window.showWarningMessage('The evidence file is unavailable. Run a fresh investigation.'));
    else if (name === 'cancel') investigation.cancel();
    else if (name === 'tips') { showInvestigation = false; revision++; }
  }
  const bridge = await createBridge(() => { lastPetPoll = Date.now(); return snapshot(); }, action);

  async function pythonPath() {
    const configured = vscode.workspace.getConfiguration('releaseDetective').get('pythonPath', '');
    const candidates = [configured, path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'pythonw.exe')];
    const localPrograms = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
    try { for (const name of await fs.readdir(localPrograms)) candidates.push(path.join(localPrograms, name, 'pythonw.exe')); } catch { /* Optional Python install. */ }
    for (const candidate of candidates) {
      if (!candidate || !path.isAbsolute(candidate)) continue;
      try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Try the next installation. */ }
    }
    throw new Error('Set Release Detective: Python Path to an installed Python with tkinter.');
  }

  async function showPet() {
    if (process.platform !== 'win32') { vscode.window.showInformationMessage('The floating pet currently supports Windows. Local diagnostics still work.'); return; }
    if (child && child.exitCode === null) { snoozedUntil = 0; revision++; return; }
    try {
      const executable = await pythonPath();
      const env = {};
      for (const name of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) if (process.env[name]) env[name] = process.env[name];
      env.RD_PET_PORT = String(bridge.port); env.RD_PET_TOKEN = bridge.token;
      child = spawn(executable, [path.join(context.extensionPath, 'native', 'pet.py')], { env, windowsHide: true, shell: false, stdio: 'ignore' });
      child.once('error', () => { child = null; vscode.window.showErrorMessage('Could not launch the companion. Check your Python Path setting.'); });
      child.once('exit', () => { child = null; });
    } catch (error) { vscode.window.showErrorMessage(error.message); }
  }
  function hidePet() { if (child) { child.kill(); child = null; } }

  context.subscriptions.push(diagnostics, status,
    vscode.commands.registerCommand('releaseDetective.showPet', showPet),
    vscode.commands.registerCommand('releaseDetective.hidePet', hidePet),
    vscode.commands.registerCommand('releaseDetective.scan', () => scan()),
    vscode.commands.registerCommand('releaseDetective.findings', async () => {
      const selected = await vscode.window.showQuickPick(findings.map((item, position) => ({ label: item.title, description: `Line ${item.line + 1} · ${item.severity}`, detail: item.tip, position })), { placeHolder: findings.length ? 'Choose a finding to visit its line' : 'No matches in the current local checks' });
      if (selected) { showInvestigation = false; index = selected.position; explanation = ''; revision++; await jump(); }
    }),
    vscode.commands.registerCommand('releaseDetective.explain', explain),
    vscode.commands.registerCommand('releaseDetective.investigate', () => startInvestigation()),
    vscode.commands.registerCommand('releaseDetective.project', startProjectInvestigation),
    vscode.commands.registerCommand('releaseDetective.demo', () => startInvestigation('demo')),
    vscode.commands.registerCommand('releaseDetective.review', reviewFix),
    vscode.commands.registerCommand('releaseDetective.evidence', openEvidence),
    vscode.commands.registerCommand('releaseDetective.cancel', () => investigation.cancel()),
    vscode.commands.registerCommand('releaseDetective.configureKey', async () => {
      const key = await vscode.window.showInputBox({ password: true, prompt: 'AI service key. Stored in VS Code SecretStorage. Explain sends a generic security question only.', ignoreFocusOut: true });
      if (key?.trim()) { await context.secrets.store('openrouterKey', key.trim()); vscode.window.showInformationMessage('AI service key saved for Release Detective.'); }
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => scan(editor)),
    vscode.workspace.onDidChangeTextDocument(event => { if (event.document === vscode.window.activeTextEditor?.document) { clearTimeout(timer); timer = setTimeout(() => scan(), 700); } }),
    vscode.workspace.onDidSaveTextDocument(current => { if (current === vscode.window.activeTextEditor?.document) scan(); }),
    vscode.window.onDidChangeWindowState(value => { focus = value.focused; }),
    { dispose: () => { clearTimeout(timer); investigation.dispose(); hidePet(); bridge.close(); } }
  );
  scan();
  if (process.env.RD_COMPANION_TEST !== '1' && vscode.workspace.getConfiguration('releaseDetective').get('autoShow', true)) await showPet();
  // Testable public API contains no file contents, credential values or bridge token.
  return { snapshot, scan: () => scan() };
}
module.exports = { activate };
