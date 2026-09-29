import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
import { api, auth, createFixture, PASSWORD, resetDb, type Fixture } from './helpers';

let f: Fixture;

beforeAll(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

describe('auth', () => {
  it('logs in case-insensitively and returns a token + user', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'HQ@Test.io', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ email: 'hq@test.io', role: 'HQ_ADMIN', outletId: null });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects a wrong password with 401', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'hq@test.io', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown users with the same 401', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'ghost@test.io', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('requires a valid token on protected routes', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(auth('garbage'))).status).toBe(401);
    const me = await api().get('/api/v1/auth/me').set(auth(f.outlets.a.token));
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ role: 'OUTLET_STAFF', outletId: f.outlets.a.id });
  });

  it('treats a signed token for a user that no longer exists as an invalid session (401)', async () => {
    const token = jwt.sign(
      { sub: '00000000-0000-4000-8000-000000000000', email: 'gone@test.io', name: 'Gone', role: 'HQ_ADMIN', outletId: null },
      env.JWT_SECRET,
    );
    const res = await api().get('/api/v1/auth/me').set(auth(token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_INVALID');
  });

  it('returns a structured 404 for unknown routes', async () => {
    const res = await api().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', requestId: expect.any(String) });
  });
});
