import http from 'node:http';
import { randomUUID } from 'node:crypto';

// These identities and records exist only inside an isolated, loopback-only test server.
const facilities = [{
  id: 'demo-facility-01', code: 'DEMO01', name: 'Example Care Centre', type: 'HOSPITAL',
  contactEmail: 'synthetic-contact@example.invalid', onboardingNotes: 'SYNTHETIC INTERNAL NOTE - never public'
}];

export async function startFixture(policy) {
  const tokens = { patient: randomUUID(), admin: randomUUID(), auditor: randomUUID() };
  const identities = new Map([[tokens.patient, 'PATIENT'], [tokens.admin, 'ADMIN'], [tokens.auditor, 'AUDITOR']]);
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (policy.securityHeaders) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    const origin = req.headers.origin;
    if (origin && policy.allowedOrigins.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && policy.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (!['/api/facilities', '/facilities'].includes(req.url)) return send(404, { error: 'Not found' });
    if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
    const role = identities.get(req.headers.authorization?.replace(/^Bearer /, ''));
    if (policy.requireAuthentication && !role) return send(401, { error: 'Authentication required' });
    if (role && !policy.allowedRoles.includes(role)) return send(403, { error: 'Forbidden' });
    send(200, { facilities: facilities.map(record => Object.fromEntries(policy.responseFields.map(key => [key, record[key]]))) });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`, tokens,
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); })
  };
}
