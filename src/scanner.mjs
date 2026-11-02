import { startFixture } from './fixture.mjs';
import { PUBLIC_FIELDS, APPROVED_ORIGIN } from './policy.mjs';

export const RULES = Object.freeze([
  { id: 'AUTH-001', title: 'Authentication is missing or ineffective', severity: 'critical', action: 'require_authentication' },
  { id: 'ROLE-001', title: 'Facility access violates the approved role policy', severity: 'high', action: 'restrict_roles' },
  { id: 'DATA-001', title: 'Facility data exceeds the public response contract', severity: 'high', action: 'minimize_response' },
  { id: 'HEAD-001', title: 'Response security headers are missing', severity: 'medium', action: 'secure_headers' },
  { id: 'CORS-001', title: 'Cross-origin access violates the approved policy', severity: 'medium', action: 'restrict_cors' }
]);

export async function scanPolicy(policy) {
  const target = await startFixture(policy);
  const checks = [];
  const add = (rule, name, passed, expected, observed) => checks.push({ rule, name, passed, expected, observed });
  try {
    for (const route of ['/api/facilities', '/facilities']) {
      const responses = {};
      for (const identity of ['anonymous', 'invalid', 'patient', 'admin', 'auditor']) {
        const token = identity === 'invalid' ? 'invalid-demo-session' : target.tokens[identity];
        const response = await fetch(target.baseUrl + route, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: 'https://untrusted.example.invalid' },
          signal: AbortSignal.timeout(5000), redirect: 'error'
        });
        const body = await response.json();
        responses[identity] = { response, body };
        if (identity === 'anonymous' || identity === 'invalid') {
          add('AUTH-001', `${route} / ${identity}`, response.status === 401 && !body.facilities,
            '401 with no facility data', `${response.status}${body.facilities ? ' with facility data' : ''}`);
        }
        if (['patient', 'admin', 'auditor'].includes(identity)) {
          const expected = identity === 'auditor' ? 403 : 200;
          add('ROLE-001', `${route} / ${identity}`, response.status === expected && (expected === 200 || !body.facilities), `${expected}`, `${response.status}`);
        }
        const secure = response.headers.get('cache-control') === 'no-store' && response.headers.get('x-content-type-options') === 'nosniff'
          && response.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") && response.headers.get('referrer-policy') === 'no-referrer';
        add('HEAD-001', `${route} / ${identity} headers`, Boolean(secure), 'no-store, nosniff, frame-ancestors none, no-referrer', secure ? 'All required headers present' : 'One or more required headers missing');
        add('CORS-001', `${route} / ${identity} untrusted origin`, !response.headers.has('access-control-allow-origin'), 'No cross-origin grant', response.headers.get('access-control-allow-origin') || 'No cross-origin grant');
      }
      for (const identity of ['patient', 'admin']) {
        const records = responses[identity].body.facilities;
        const fields = Array.isArray(records) && records.length ? Object.keys(records[0]).sort() : [];
        const valid = Array.isArray(records) && records.length > 0 && records.every(record => JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...PUBLIC_FIELDS].sort()));
        add('DATA-001', `${route} / ${identity} fields`, valid, PUBLIC_FIELDS.join(', '), fields.join(', ') || 'No facility records');
      }
      const approved = await fetch(target.baseUrl + route, { headers: { Authorization: `Bearer ${target.tokens.patient}`, Origin: APPROVED_ORIGIN }, signal: AbortSignal.timeout(5000), redirect: 'error' });
      await approved.arrayBuffer();
      add('CORS-001', `${route} / approved origin`, approved.status === 200 && approved.headers.get('access-control-allow-origin') === APPROVED_ORIGIN,
        APPROVED_ORIGIN, approved.headers.get('access-control-allow-origin') || 'No cross-origin grant');
    }
    const findings = RULES.filter(rule => checks.some(check => check.rule === rule.id && !check.passed)).map(rule => ({
      ...rule, evidence: checks.filter(check => check.rule === rule.id && !check.passed)
    }));
    return { checks, findings, passed: checks.filter(check => check.passed).length, total: checks.length, gate: findings.length ? 'HOLD' : 'PASS' };
  } finally { await target.close(); }
}
