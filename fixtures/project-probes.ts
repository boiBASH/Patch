// Copied into an isolated iVoucher lab. Real HTTP routes and JWT validation;
// only the database is replaced, with synthetic records. No external target.
import request from 'supertest';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';

const db = vi.hoisted(() => ({
  facility: { findMany: vi.fn() },
  patientPortalAccount: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() }
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: db }));
import { createApp } from '../src/app.js';
import { signAuthToken } from '../src/utils/jwt.js';

const checks: Array<{ id: string; category: string; passed: boolean; expected: unknown; observed: unknown }> = [];
const synthetic = { id: 'lab-facility', code: 'LAB-001', name: 'Synthetic demo facility', type: 'SPOKE', state: 'Test region', onboardingStatus: 'APPROVED', onboardingNotes: 'Synthetic internal note', contactEmail: 'synthetic@example.invalid' };
const fields = ['code', 'id', 'name', 'type'];
function check(id: string, category: string, observed: unknown, expected: unknown) {
  const passed = JSON.stringify(observed) === JSON.stringify(expected);
  checks.push({ id, category, passed, observed, expected });
  expect(observed, id).toEqual(expected);
}
beforeEach(() => {
  vi.clearAllMocks();
  db.patientPortalAccount.findUnique.mockResolvedValue({ id: 'lab-patient', isActive: true });
  db.user.findUnique.mockResolvedValue({ id: 'lab-admin', isActive: true, role: 'ADMIN', facilityId: null, facility: null });
  db.facility.findMany.mockImplementation(async (query: any) => [query.select
    ? Object.fromEntries(Object.keys(query.select).filter(k => query.select[k]).map(k => [k, synthetic[k as keyof typeof synthetic]]))
    : { ...synthetic }]);
});
const patient = () => signAuthToken({ sub: 'lab-patient', actorType: 'PATIENT', role: 'PATIENT' });
const admin = () => signAuthToken({ sub: 'lab-admin', actorType: 'USER', role: 'ADMIN' });
for (const route of ['/api/facilities', '/facilities']) {
  it(`${route}: anonymous access is denied`, async () => {
    const res = await request(createApp()).get(route);
    check(`${route}:anonymous`, 'authentication', res.status, 401);
  });
  it(`${route}: malformed token is denied`, async () => {
    const res = await request(createApp()).get(route).set('Authorization', 'Bearer invalid-lab-token');
    check(`${route}:invalid-token`, 'authentication', res.status, 401);
  });
  it(`${route}: inactive patient is denied`, async () => {
    db.patientPortalAccount.findUnique.mockResolvedValue({ id: 'lab-patient', isActive: false });
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${patient()}`);
    check(`${route}:inactive-patient`, 'authorization', res.status, 401);
  });
  it(`${route}: changed staff role is denied`, async () => {
    db.user.findUnique.mockResolvedValue({ id: 'lab-admin', isActive: true, role: 'PROGRAM_OFFICER', facilityId: null });
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${admin()}`);
    check(`${route}:changed-role`, 'authorization', res.status, 401);
  });
  it(`${route}: unassigned hospital scanner is denied`, async () => {
    db.user.findUnique.mockResolvedValue({ id: 'lab-scanner', isActive: true, role: 'HOSPITAL_SCANNER', facilityId: null });
    const token = signAuthToken({ sub: 'lab-scanner', actorType: 'USER', role: 'HOSPITAL_SCANNER' });
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${token}`);
    check(`${route}:unassigned-scanner`, 'authorization', res.status, 401);
  });
  it(`${route}: active patient retains access`, async () => {
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${patient()}`);
    check(`${route}:patient-access`, 'availability', res.status, 200);
  });
  it(`${route}: admin needs no facility assignment`, async () => {
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${admin()}`);
    check(`${route}:admin-access`, 'availability', res.status, 200);
  });
  it(`${route}: response contains only public fields`, async () => {
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${patient()}`);
    check(`${route}:public-fields`, 'data-exposure', Object.keys(res.body[0] || {}).sort(), fields);
  });
  it(`${route}: security headers and caching policy remain present`, async () => {
    const res = await request(createApp()).get(route).set('Authorization', `Bearer ${patient()}`);
    check(`${route}:headers`, 'headers', {
      cache: res.headers['cache-control'], nosniff: res.headers['x-content-type-options'],
      frame: res.headers['x-frame-options'], csp: Boolean(res.headers['content-security-policy']),
      hsts: Boolean(res.headers['strict-transport-security']), poweredBy: Boolean(res.headers['x-powered-by'])
    }, { cache: 'no-store', nosniff: 'nosniff', frame: 'SAMEORIGIN', csp: true, hsts: true, poweredBy: false });
  });
  it(`${route}: an unapproved origin receives no CORS permission`, async () => {
    const res = await request(createApp()).get(route).set('Origin', 'https://unapproved.example.invalid');
    check(`${route}:cors`, 'cors', Boolean(res.headers['access-control-allow-origin']), false);
  });
}
afterAll(() => {
  if (!process.env.RD_PROBE_OUTPUT) throw new Error('Probe output path is required.');
  writeFileSync(process.env.RD_PROBE_OUTPUT, JSON.stringify({ total: checks.length, passed: checks.filter(c => c.passed).length, checks }, null, 2));
});
