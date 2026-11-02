'use strict';
const fs = require('node:fs/promises');
const { RULES } = require('./rules.cjs');

async function keyFromEnvFile(file) {
  if (!file) return '';
  try {
    const info = await fs.stat(file);
    if (info.size > 65536) return '';
    const text = await fs.readFile(file, 'utf8');
    for (const name of ['AI_API_KEY', 'OPENROUTER_API_KEY']) {
      const match = text.match(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*(.*?)[ \\t]*\\r?$`, 'm'));
      const key = (match?.[1] || '').replace(/^(["'])(.*)\1$/, '$2');
      if (key.trim()) return key.trim();
    }
    return '';
  } catch { return ''; }
}

async function explainRule(ruleId, apiKey, model, fetchImpl = fetch) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error('Choose a finding first.');
  if (!apiKey) throw new Error('Add your key to Release Detective .env, or use Release Detective: Set AI Service Key.');
  if (!/^[a-zA-Z0-9._:/~-]{1,180}$/.test(model)) throw new Error('Choose a valid AI model ID.');
  let response;
  try {
    response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 400, temperature: 0.2, messages: [
        { role: 'system', content: 'Give concise, practical defensive software-security advice in plain text, at most 100 words. This is a generic educational question. You have not inspected the project. Never claim a vulnerability is confirmed or a release is secure. Do not request code, credentials, or private data.' },
        { role: 'user', content: rule.question }
      ] })
    });
  } catch { throw new Error('Could not reach the AI service. Your local checks still work.'); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`AI service returned HTTP ${response.status}. Check your key, credits and model.`); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 32768) throw new Error('Model response too large.'); chunks.push(Buffer.from(part.value)); }
    const parsed = JSON.parse(Buffer.concat(chunks));
    const choice = parsed.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw new Error('No complete explanation returned.');
    return choice.message.content.slice(0, 1800).split(apiKey).join('[REDACTED]');
  } catch { throw new Error('AI service did not return a complete explanation.'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
module.exports = { explainRule, keyFromEnvFile };
