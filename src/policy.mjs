import { createHash } from 'node:crypto';

export const PUBLIC_FIELDS = Object.freeze(['id', 'code', 'name', 'type']);
export const APPROVED_ROLES = Object.freeze(['PATIENT', 'ADMIN']);
export const APPROVED_ORIGIN = 'https://demo.release-detective.example';
export const ACTIONS = Object.freeze({
  require_authentication: { title: 'Require authentication', key: 'requireAuthentication', value: true },
  restrict_roles: { title: 'Enforce approved roles', key: 'allowedRoles', value: APPROVED_ROLES },
  minimize_response: { title: 'Return approved facility fields', key: 'responseFields', value: PUBLIC_FIELDS },
  secure_headers: { title: 'Protect responses and caching', key: 'securityHeaders', value: true },
  restrict_cors: { title: 'Restrict cross-origin access', key: 'allowedOrigins', value: [APPROVED_ORIGIN] }
});

export function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function applyActions(policy, actions) {
  if (!Array.isArray(actions) || actions.length > 5 || new Set(actions).size !== actions.length) throw new Error('Invalid remediation actions.');
  const candidate = structuredClone(policy);
  for (const id of actions) {
    if (!Object.hasOwn(ACTIONS, id)) throw new Error('Unsupported remediation action.');
    candidate[ACTIONS[id].key] = structuredClone(ACTIONS[id].value);
  }
  return candidate;
}

export function policyPatch(before, after) {
  return Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({
    op: 'replace', path: `/${key}`, from: before[key], value: after[key]
  }));
}
