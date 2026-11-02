import test from 'node:test';
import assert from 'node:assert/strict';
import { openRouterPlan, validatePlan, planWithProvider } from '../src/providers.mjs';
import { loadConfig } from '../src/config.mjs';

const context = { policy: { requireAuthentication: false }, findings: [{ id: 'AUTH-001', action: 'require_authentication' }] };
const plan = { summary: 'Authentication is missing.', rationale: 'The anonymous request returns facility records.', actions: ['require_authentication'], reviewNotes: 'Review the verified candidate.' };
const config = { model: 'openai/gpt-4.1-mini', apiKey: ['synthetic', 'credential'].join('-') };
const response = (value, finish = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('OpenRouter adapter sends only synthetic context with bounded structured output', async () => {
  const result = await openRouterPlan(context, config, async (url, request) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.headers.Authorization, `Bearer ${config.apiKey}`);
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal);
    const body = JSON.parse(request.body);
    assert.equal(body.model, config.model);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.max_tokens, 1800);
    assert.deepEqual(body.response_format.json_schema.schema.properties.actions.items.enum, ['require_authentication']);
    assert.deepEqual(Object.keys(JSON.parse(body.messages[1].content).allowedActions), ['require_authentication']);
    assert.equal(request.body.includes(config.apiKey), false);
    assert.deepEqual(JSON.parse(body.messages[1].content).policy, context.policy);
    return response(plan);
  });
  assert.deepEqual(result, plan);
});

for (const status of [401, 402, 403, 429, 500]) {
  test(`OpenRouter HTTP ${status} fails without exposing response bodies`, async () => {
    await assert.rejects(openRouterPlan(context, config, async () => new Response(config.apiKey, { status })), error => !error.message.includes(config.apiKey));
  });
}

test('missing API key never silently falls back to a demo result', async () => {
  let requested = false;
  await assert.rejects(openRouterPlan(context, { ...config, apiKey: '' }, async () => { requested = true; }), /AI service key/);
  assert.equal(requested, false);
});

test('network errors are sanitized', async () => {
  await assert.rejects(openRouterPlan(context, config, async () => { throw new Error(config.apiKey); }), error => !error.message.includes(config.apiKey));
});

test('truncated, malformed and oversized model results are rejected', async () => {
  await assert.rejects(openRouterPlan(context, config, async () => response(plan, 'length')), /complete plan/);
  await assert.rejects(openRouterPlan(context, config, async () => new Response('invalid')), /unreadable/);
  await assert.rejects(openRouterPlan(context, config, async () => new Response('x'.repeat(70000))), /oversized/);
  await assert.rejects(openRouterPlan(context, config, async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not json' } }] }))), /invalid plan JSON/);
});

test('model cannot inject commands, extra fields, duplicate or unrelated actions', () => {
  for (const actions of [['__proto__'], ['../policy.json'], ['require_authentication', 'require_authentication'], ['restrict_roles']]) {
    assert.throws(() => validatePlan({ ...plan, actions }, context.findings));
  }
  assert.throws(() => validatePlan({ ...plan, command: 'ignore checks' }, context.findings));
  assert.throws(() => validatePlan({ ...plan, summary: '' }, context.findings));
  assert.throws(() => validatePlan({ ...plan, summary: 'x'.repeat(4001) }, context.findings));
});

test('provider selection and config validation are explicit', async () => {
  await assert.rejects(planWithProvider('galileo', context, config), /Unknown provider/);
  assert.throws(() => loadConfig({ PORT: 'not-a-port' }, false));
  assert.throws(() => loadConfig({ OPENROUTER_MODEL: 'bad\nmodel' }, false));
  assert.equal(loadConfig({}, false).port, 4317);
});

test('neutral AI configuration takes precedence while existing configuration remains compatible', () => {
  const legacy = { OPENROUTER_API_KEY: 'legacy-test-value', OPENROUTER_MODEL: 'legacy/model' };
  assert.equal(loadConfig(legacy, false).apiKey, 'legacy-test-value');
  const current = loadConfig({ ...legacy, AI_API_KEY: 'neutral-test-value', AI_MODEL: 'test/model' }, false);
  assert.equal(current.apiKey, 'neutral-test-value');
  assert.equal(current.model, 'test/model');
  assert.equal(loadConfig({ ...legacy, AI_API_KEY: '', AI_MODEL: '' }, false).apiKey, 'legacy-test-value');
  assert.throws(() => loadConfig({ AI_MODEL: 'bad\nmodel' }, false), /AI_MODEL/);
});
