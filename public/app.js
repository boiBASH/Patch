/* Model text and report content are always rendered as text, never executable HTML. */
const $ = selector => document.querySelector(selector);
const state = { token: '', run: null, activeId: null, provider: null, timer: null };
const labels = { context: 'Gather context', detect: 'Detect exposures', reason: 'Investigate', act: 'Prepare fix', verify: 'Verify candidate', report: 'Report evidence', failed: 'Investigation stopped' };

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${state.token}`, ...options.headers } });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { message = (await response.json()).error || message; } catch { /* Keep the HTTP error. */ }
    throw new Error(message);
  }
  return response;
}

function error(message) { $('#error').textContent = message || ''; $('#error').hidden = !message; }
function setBusy() {
  $('#start').disabled = Boolean(state.activeId);
  $('#mode').disabled = Boolean(state.activeId);
  $('#start').textContent = state.activeId ? 'Investigating…' : '↗  Start investigation';
}
function dateLabel(value) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

async function history() {
  const runs = await (await api('/api/runs')).json();
  $('#run-count').textContent = runs.length;
  const container = $('#history');
  container.replaceChildren();
  if (!runs.length) container.append(node('p', 'Your investigations will appear here.', 'sidebar-empty'));
  for (const run of runs.slice(0, 30)) {
    const button = node('button', undefined, state.run?.id === run.id ? 'active' : '');
    button.type = 'button';
    const dot = node('span', '', 'history-dot');
    button.append(dot, document.createTextNode(`${run.mode === 'demo' ? 'Demo' : 'AI'} · ${run.id.slice(0, 8)}`), node('small', `${dateLabel(run.startedAt)} · ${run.gate}`));
    button.addEventListener('click', () => selectRun(run.id).catch(e => error(e.message)));
    container.append(button);
  }
  return runs;
}

function renderChecks() {
  const scan = state.run?.[$('#evidence-phase').value];
  $('#checks-empty').hidden = Boolean(scan);
  $('#check-rows').replaceChildren();
  for (const check of scan?.checks || []) {
    const row = node('tr');
    row.append(node('td', check.name), node('td', check.expected), node('td', check.observed), node('td', check.passed ? 'PASS' : 'FAIL', check.passed ? 'result-pass' : 'result-fail'));
    $('#check-rows').append(row);
  }
}

function renderRun(run) {
  state.run = run;
  $('#run-label').textContent = `${run.id.slice(0, 8)} · ${dateLabel(run.startedAt)} · ${run.status.replaceAll('_', ' ')}`;
  $('#finding-value').textContent = run.baseline ? run.baseline.findings.length : '—';
  $('#finding-detail').textContent = run.baseline ? `${run.baseline.total - run.baseline.passed} failing checks across ${run.baseline.findings.length} rules` : 'Collecting baseline evidence';
  $('#check-value').replaceChildren(document.createTextNode(run.verification ? String(run.verification.passed) : '—'), node('small', ` / ${run.verification?.total ?? '—'}`));
  $('#check-detail').textContent = run.verification ? 'Repeated against the isolated candidate' : 'Candidate verification pending';
  $('#gate-value').textContent = run.gate === 'PASS' ? 'Passed' : 'On hold';
  $('#gate-value').className = run.gate === 'PASS' ? 'gate-pass' : 'gate-hold';
  $('#gate-detail').textContent = run.gate === 'PASS' ? 'Ready for human review · no deployment' : run.status === 'running' ? 'Investigation in progress' : 'Incomplete or failing verification';
  $('#findings-badge').textContent = run.baseline ? `${run.baseline.findings.length} identified` : 'Scanning';
  $('#agent-mode').textContent = run.mode === 'demo' ? 'Offline playbook' : 'AI investigation';
  $('#checks-badge').textContent = run.verification?.total || run.baseline?.total || 0;
  $('#export').disabled = run.status === 'running';
  $('#evidence-export').disabled = run.status === 'running';
  $('#candidate-export').disabled = !run.candidate;
  const findings = $('#findings'); findings.replaceChildren();
  if (!run.baseline) findings.append(node('p', 'Probing the synthetic API…', 'muted'));
  else if (!run.baseline.findings.length) findings.append(node('p', 'No failures found in the tested scope.', 'muted'));
  for (const finding of run.baseline?.findings || []) {
    const card = node('article', undefined, 'finding');
    const top = node('div', undefined, 'finding-top');
    top.append(node('span', finding.severity, `severity ${finding.severity}`), node('span', finding.id, 'finding-code'));
    if (run.verification && !run.verification.findings.some(item => item.id === finding.id)) top.append(node('span', '✓ Verified fix', 'finding-resolved'));
    const details = node('details');
    details.append(node('summary', `${finding.evidence.length} failed baseline checks`));
    for (const item of finding.evidence) details.append(node('p', `${item.name}: expected ${item.expected}; observed ${item.observed}.`));
    card.append(top, node('h4', finding.title), details); findings.append(card);
  }
  const summary = $('#agent-summary'); summary.replaceChildren();
  if (run.plan) {
    summary.append(node('p', run.plan.summary), node('p', run.plan.rationale, 'muted'), node('p', run.plan.reviewNotes, 'muted'));
  } else summary.append(node('p', run.error || 'Gathering evidence for the investigation…', 'muted'));
  const activity = $('#activity'); activity.replaceChildren();
  for (const event of run.events) {
    const item = node('li'); item.append(node('strong', labels[event.stage] || event.stage), document.createTextNode(event.message)); activity.append(item);
  }
  const patch = $('#patch-content'); patch.replaceChildren();
  if (!run.patch.length) patch.append(node('p', 'No candidate changes have been prepared.', 'muted'));
  for (const change of run.patch) {
    const card = node('article', undefined, 'patch-change');
    card.append(node('h4', `fixtures/facility-policy.json → ${change.path}`), node('pre', `− ${JSON.stringify(change.from, null, 2)}`, 'patch-line removed'), node('pre', `+ ${JSON.stringify(change.value, null, 2)}`, 'patch-line added'));
    patch.append(card);
  }
  renderChecks();
  if (run.error) error(run.error); else error('');
}

async function selectRun(id) {
  renderRun(await (await api(`/api/runs/${id}`)).json());
  await history();
}

async function poll() {
  clearTimeout(state.timer);
  if (!state.activeId) return;
  try {
    const run = await (await api(`/api/runs/${state.activeId}`)).json();
    if (!state.run || state.run.id === run.id) renderRun(run);
    if (run.status !== 'running') { state.activeId = null; setBusy(); await history(); return; }
  } catch (e) { error(e.message); }
  state.timer = setTimeout(poll, 1000);
}

$('#start').addEventListener('click', async () => {
  error(''); $('#start').disabled = true;
  try {
    const run = await (await api('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: $('#mode').value }) })).json();
    state.activeId = run.id; setBusy(); await selectRun(run.id); await poll();
  } catch (e) { error(e.message); setBusy(); }
});

function selectTab(button) {
  for (const tab of document.querySelectorAll('[role=tab]')) {
    const active = tab === button;
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    $(`#${tab.dataset.tab}`).hidden = !active;
  }
}
const tabs = [...document.querySelectorAll('[role=tab]')];
tabs.forEach((button, index) => {
  button.addEventListener('click', () => selectTab(button));
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectTab(tabs[next]); tabs[next].focus(); }
  });
});
$('#evidence-phase').addEventListener('change', renderChecks);

function download(kind, filename) {
  const link = node('a');
  link.href = `/api/runs/${state.run.id}/${kind}`;
  link.download = filename;
  document.body.append(link); link.click(); link.remove();
}
$('#export').addEventListener('click', () => download('report', `release-detective-${state.run.id.slice(0, 8)}.md`));
$('#evidence-export').addEventListener('click', () => download('evidence', `evidence-${state.run.id.slice(0, 8)}.json`));
$('#candidate-export').addEventListener('click', () => download('candidate', 'facility-policy.candidate.json'));

async function init() {
  try {
    const bootstrap = await (await fetch('/api/bootstrap')).json();
    state.token = bootstrap.sessionToken; state.provider = bootstrap.provider; state.activeId = bootstrap.activeRunId;
    $('#provider-status').textContent = bootstrap.provider.configured ? 'AI investigation ready' : 'Demo ready · Add your AI service key to .env, then restart to enable AI';
    if (bootstrap.provider.configured) $('#mode').value = 'openrouter';
    const runs = await history();
    if (state.activeId || runs.length) await selectRun(state.activeId || runs[0].id);
    setBusy(); await poll();
  } catch (e) { error(`Could not connect to the local app. ${e.message}`); $('#start').disabled = true; }
}
void init();
