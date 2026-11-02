'use strict';
const RULES = Object.freeze({
  secret: { severity: 'high', title: 'Possible credential in source', tip: 'Keep credentials in a secret store or an ignored environment file. If this was a real key that was shared, revoke it and create a replacement.', question: 'How should an application handle a credential accidentally committed in source code?' },
  cors: { severity: 'medium', title: 'Broad cross-origin access', tip: 'Use an explicit list of approved browser origins. CORS is not authentication; protect the API independently.', question: 'How do explicit CORS allowlists work, and why is CORS not an authentication control?' },
  tls: { severity: 'high', title: 'TLS verification appears disabled', tip: 'Keep certificate verification enabled. Fix the certificate chain or local trust configuration instead.', question: 'Why is disabling TLS certificate verification risky, and how should certificate trust failures be fixed?' },
  auth: { severity: 'review', title: 'Review route authentication', tip: 'I cannot see an authentication guard on this route. Check router-level middleware, role checks, and object ownership before exposing sensitive data.', question: 'How should an Express API combine authentication, role authorization, object ownership checks and negative tests?' },
  fields: { severity: 'review', title: 'Review fields returned from the database', tip: 'Select the fields the client actually needs before returning database records. Test that internal notes and contact details stay out of public responses.', question: 'How can an API prevent excessive data exposure using explicit response projections and negative tests?' },
  sql: { severity: 'high', title: 'Unsafe raw SQL needs review', tip: 'Use parameterized queries. Never combine user input with executable SQL text.', question: 'How do parameterized queries prevent SQL injection, and how should unsafe raw-query calls be reviewed?' },
  shell: { severity: 'high', title: 'Dynamic shell command needs review', tip: 'Avoid passing interpolated input to a shell. Prefer an executable with a fixed argument array and validate each argument.', question: 'How can Node.js applications avoid command injection when launching child processes?' },
  debug: { severity: 'medium', title: 'Error details may reach the client', tip: 'Return a generic error with a request ID. Keep stack traces and internal exception details in protected server logs.', question: 'How should an API report errors without exposing stack traces, credentials or internal infrastructure details?' }
});

const IDLE_TIPS = Object.freeze([
  'Let\'s sniff out the negative paths too: anonymous requests, the wrong role, and another user\'s records.',
  'Before a release, check dependencies, secrets, response fields, and the deployed endpoint permissions.',
  'A tip from Patch: even a private repository needs good secret hygiene. Keep credentials outside source control.',
  'Return an explicit list of response fields. New database columns should never become public by accident.',
  'A passing local check is a clue, not proof of security. Keep the staging security gate and human review.'
]);

function eligible(file, language, size) {
  const normalized = String(file).replaceAll('\\', '/');
  return size <= 250000 && !/(?:^|\/)(?:\.env(?:\.[^/]*)?|node_modules|\.git|dist|build|coverage)(?:\/|$)/i.test(normalized)
    && /^(javascript|typescript|javascriptreact|typescriptreact|json|yaml|python)$/.test(language);
}

function analyze(text, language = 'javascript', file = 'active.js') {
  if (!eligible(file, language, text.length)) return [];
  const findings = [];
  const lines = text.split(/\r?\n/);
  let blockComment = false;
  const guard = /\b(?:requireAuth|authenticate|authentication|verifyToken|ensureAuth|requireSession|jwtAuth)\b/;
  let routerGuardSeen = false;
  lines.forEach((raw, line) => {
    // A bounded heuristic, not a parser or a claim that global middleware is absent.
    let code = raw;
    if (blockComment) { const end = code.indexOf('*/'); if (end < 0) return; code = code.slice(end + 2); blockComment = false; }
    code = code.replace(/\/\*.*?\*\//g, '');
    const start = code.indexOf('/*');
    if (start >= 0) { blockComment = true; code = code.slice(0, start); }
    if (/^\s*(?:\/\/|#)/.test(code)) return;
    const add = (rule, match) => {
      if (!match || findings.length >= 30) return;
      const spec = RULES[rule];
      findings.push({ id: `${rule}:${line}`, rule, line, character: Math.max(0, code.indexOf(match[0])), ...spec });
    };
    add('secret', code.match(/(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9/+_-]{16,}["']/i)
      || code.match(/sk-or-v1-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}/));
    add('cors', code.match(/\bcors\s*\(\s*\)|\borigin\s*:\s*(?:["']\*["']|true)/));
    add('tls', code.match(/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/));
    if (/\.use\s*\(/.test(code) && guard.test(code)) routerGuardSeen = true;
    const route = code.match(/\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*["'][^"']+["']\s*,/);
    if (route && !routerGuardSeen && !guard.test(code)) add('auth', route);
    add('fields', code.match(/\.findMany\s*\(\s*\)/));
    add('sql', code.match(/\$queryRawUnsafe\s*\(|\$executeRawUnsafe\s*\(/));
    add('shell', code.match(/\bexec(?:Sync)?\s*\(\s*`[^`]*\$\{/));
    add('debug', code.match(/\.(?:json|send)\s*\(\s*(?:err|error)(?:\.stack)?\s*\)/));
  });
  return findings;
}

module.exports = { RULES, IDLE_TIPS, analyze, eligible };
