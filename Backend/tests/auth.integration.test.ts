import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';
import { hashPassword } from '../src/auth/password';

test('JWT session login, profile, logout, and password change', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 120000,
}, async (t) => {
  const name = `learnflow_auth_${process.pid}_${Date.now()}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const management = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  t.after(async () => {
    if (created) await management.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await management.end();
  });
  await management.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'learnflow');
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-32-characters';
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(migrate.status, 0, `${migrate.stdout}\n${migrate.stderr}`);
  const { getPrisma, closeDatabase } = await import('../src/database');
  const { default: app } = await import('../src/app');
  const { config } = await import('../src/config');
  const prisma = getPrisma();
  const password = 'temporary-password-1';
  const user = await prisma.user.create({ data: {
    email: 'Ada@Example.test', name: 'Ada', passwordHash: await hashPassword(password), mustChangePassword: true,
  } });
  await prisma.user.create({ data: {
    email: 'inactive@example.test', name: 'Inactive', passwordHash: await hashPassword(password), isActive: false,
  } });
  const course = await prisma.course.create({ data: { name: 'Main course', courseCode: 'A' } });
  await prisma.enrollment.create({ data: { courseId: course.id, userId: user.id, role: 'student' } });

  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  // Call an API route and keep the auth cookie returned by the previous response.
  const request = async (path: string, options: { method?: string; body?: unknown; cookie?: string } = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${config.authCookie}=`));
    const data = response.status === 204 ? undefined : await response.json();
    return { status: response.status, data, cookie: cookie?.split(';')[0] };
  };

  await t.test('login rejects bad credentials and sets a session cookie for an active account', async () => {
    assert.deepEqual(await request('/api/auth/login', { method: 'POST', body: { email: 'ada@example.test', password: 'wrong-password-1' } }),
      { status: 401, data: { message: 'Unauthorized' }, cookie: undefined });
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'inactive@example.test', password } })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'missing@example.test', password } })).status, 401);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'ada@example.test', password, isAdmin: true } })).status, 400);
    const loggedIn = await request('/api/auth/login', { method: 'POST', body: { email: ' Ada@Example.test ', password } });
    assert.equal(loggedIn.status, 200);
    assert.ok(loggedIn.cookie);
    assert.equal(loggedIn.cookie.slice(`${config.authCookie}=`.length).split('.').length, 3);
    assert.deepEqual(loggedIn.data, { id: user.id, name: 'Ada', email: 'Ada@Example.test', isAdmin: false, mustChangePassword: true });
    const profile = await request('/api/auth/me', { cookie: loggedIn.cookie });
    assert.deepEqual(profile.data, loggedIn.data);
    assert.deepEqual(await request('/api/auth/me'), { status: 401, data: { message: 'Unauthorized' }, cookie: undefined });
    assert.deepEqual(await request('/api/courses', { cookie: loggedIn.cookie }), { status: 403, data: { message: 'Forbidden' }, cookie: undefined });
  });

  await t.test('password change clears the flag, revokes existing sessions, and allows course access', async () => {
    const first = await request('/api/auth/login', { method: 'POST', body: { email: 'ada@example.test', password } });
    const second = await request('/api/auth/login', { method: 'POST', body: { email: 'ada@example.test', password } });
    assert.equal((await request('/api/auth/change-password', { method: 'POST', cookie: first.cookie, body: { currentPassword: 'wrong-password-1', newPassword: 'replacement-password' } })).status, 400);
    assert.equal((await request('/api/auth/change-password', { method: 'POST', cookie: first.cookie, body: { currentPassword: password, newPassword: password } })).status, 400);
    const changed = await request('/api/auth/change-password', { method: 'POST', cookie: first.cookie, body: { currentPassword: password, newPassword: 'replacement-password' } });
    assert.equal(changed.status, 204);
    assert.equal(changed.cookie?.startsWith(`${config.authCookie}=`), true);
    assert.deepEqual(await request('/api/auth/me', { cookie: first.cookie }), { status: 401, data: { message: 'Unauthorized' }, cookie: undefined });
    assert.deepEqual(await request('/api/auth/me', { cookie: second.cookie }), { status: 401, data: { message: 'Unauthorized' }, cookie: undefined });
    const loggedIn = await request('/api/auth/login', { method: 'POST', body: { email: 'ada@example.test', password: 'replacement-password' } });
    assert.equal(loggedIn.data.mustChangePassword, false);
    assert.equal((await request('/api/courses', { cookie: loggedIn.cookie })).status, 200);
    const loggedOut = await request('/api/auth/logout', { method: 'POST', cookie: loggedIn.cookie });
    assert.equal(loggedOut.status, 204);
    assert.deepEqual(await request('/api/auth/me', { cookie: loggedIn.cookie }), { status: 401, data: { message: 'Unauthorized' }, cookie: undefined });
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.mustChangePassword, false);
  });
});
