import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';
import { signAuthToken } from '../src/auth/jwt';

test('course announcement CRUD, visibility, and pagination', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const name = `learnflow_announcements_${process.pid}_${Date.now()}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const management = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  let cleanup = async () => {};
  t.after(async () => {
    await cleanup();
    if (created) await management.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await management.end();
  });
  await management.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'learnflow');
  process.env.DATABASE_URL = url.toString();
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(migrated.status, 0, `${migrated.stdout}\n${migrated.stderr}`);
  const { getPrisma, closeDatabase } = await import('../src/database');
  cleanup = closeDatabase;
  const { default: app } = await import('../src/app');
  const { config } = await import('../src/config');
  const prisma = getPrisma();
  // Create an account and a real signed session cookie for the isolated test database.
  const account = async (label: string, isAdmin = false) => {
    const user = await prisma.user.create({ data: { email: `${label}@example.test`, name: label,
      passwordHash: 'test-only-invalid-hash', mustChangePassword: false, isAdmin } });
    const expiresAt = new Date(Date.now() + 60000);
    const session = await prisma.session.create({ data: { id: `announcement-${user.id}`, userId: user.id, expiresAt } });
    return { ...user, cookie: `${config.authCookie}=${signAuthToken({ sid: session.id, uid: user.id }, config.jwtSecret, expiresAt)}` };
  };
  const admin = await account('admin', true);
  const instructor = await account('instructor');
  const colleague = await account('colleague');
  const student = await account('student');
  const outsider = await account('outsider');
  const course = await prisma.course.create({ data: { name: 'Announcements', courseCode: 'A' } });
  const other = await prisma.course.create({ data: { name: 'Other', courseCode: 'B' } });
  const archived = await prisma.course.create({ data: { name: 'Archived', courseCode: 'C', status: 'archived' } });
  await prisma.enrollment.createMany({ data: [
    { courseId: course.id, userId: instructor.id, role: 'instructor' },
    { courseId: course.id, userId: colleague.id, role: 'instructor' },
    { courseId: course.id, userId: student.id, role: 'student' },
    { courseId: archived.id, userId: student.id, role: 'student' },
  ] });
  const old = await prisma.announcement.create({ data: { courseId: archived.id, authorId: admin.id, title: 'Archived', body: 'Read only' } });
  const foreign = await prisma.announcement.create({ data: { courseId: other.id, authorId: admin.id, title: 'Other', body: 'No cross-course leak' } });
  const server = app.listen(0, '127.0.0.1');
  cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
  };
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  // Send an announcement request using an optional verified account cookie.
  const request = async (path: string, cookie?: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/courses${path}`, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: response.status === 204 ? undefined : await response.json(),
      cursor: response.headers.get('x-next-cursor') };
  };
  const path = `/${course.id}/announcements`;
  let first: number;
  let hidden: number;
  let latest: number;

  await t.test('reads require membership and writes require instructor or admin permission', async () => {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, outsider.cookie)).status, 403);
    assert.equal((await request(path, student.cookie, 'POST', { title: 'No', body: 'No' })).status, 403);
    assert.equal((await request(`/${other.id}/announcements`, instructor.cookie, 'POST', { title: 'No', body: 'No' })).status, 403);
    assert.equal((await request('/999999/announcements', student.cookie)).status, 404);
    assert.deepEqual((await request(path, student.cookie)).data, []);
    assert.equal((await request(path, instructor.cookie, 'POST', { title: 'x', body: 'x', authorId: admin.id })).status, 400);
  });
  await t.test('create returns complete objects and derives the author from the session', async () => {
    const created = await request(path, instructor.cookie, 'POST', { title: ' First ', body: 'Body' });
    assert.equal(created.status, 201);
    assert.equal(created.data.title, 'First');
    assert.equal(created.data.authorId, instructor.id);
    assert.equal(created.data.courseId, course.id);
    assert.equal(created.data.isVisible, true);
    assert.ok(Number.isFinite(Date.parse(created.data.updatedAt)));
    first = created.data.id;
    hidden = (await request(path, instructor.cookie, 'POST', { title: 'Hidden', body: 'Private', isVisible: false })).data.id;
    latest = (await request(path, instructor.cookie, 'POST', { title: 'Latest', body: 'Visible' })).data.id;
    await prisma.announcement.updateMany({ where: { courseId: course.id }, data: { createdAt: new Date('2026-01-01T00:00:00.123Z') } });
  });
  await t.test('visibility and cursor paging cannot leak hidden or cross-course announcements', async () => {
    const page = await request(`${path}?limit=1`, student.cookie);
    assert.deepEqual(page.data.map((item: { id: number }) => item.id), [latest]);
    assert.equal(page.cursor, String(latest));
    const next = await request(`${path}?limit=1&cursor=${page.cursor}`, student.cookie);
    assert.deepEqual(next.data.map((item: { id: number }) => item.id), [first]);
    assert.equal(next.cursor, null);
    assert.equal((await request(path, instructor.cookie)).data.length, 3);
    assert.equal((await request(`${path}/${hidden}`, student.cookie)).status, 404);
    assert.equal((await request(`${path}/${hidden}`, instructor.cookie)).status, 200);
    assert.equal((await request(`${path}/${foreign.id}`, admin.cookie)).status, 404);
    assert.equal((await request(`${path}?cursor=${foreign.id}`, admin.cookie)).status, 400);
    assert.equal((await request(`${path}?cursor=${hidden}`, student.cookie)).status, 400);
    assert.equal((await request(`${path}?limit=101`, student.cookie)).status, 400);
  });
  await t.test('edits enforce scope and permissions while preserving the original author', async () => {
    assert.equal((await request(`${path}/${first}`, student.cookie, 'PATCH', { title: 'No' })).status, 403);
    const edited = await request(`${path}/${first}`, colleague.cookie, 'PATCH', { title: 'Edited', isVisible: false });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.authorId, instructor.id);
    assert.equal((await request(`${path}/${first}`, student.cookie)).status, 404);
    assert.equal((await request(`${path}/${foreign.id}`, instructor.cookie, 'PATCH', { title: 'No' })).status, 404);
    assert.equal((await request(`${path}/${first}`, instructor.cookie, 'PATCH', {})).status, 400);
    assert.equal((await request(`${path}/${first}`, instructor.cookie, 'PATCH', { courseId: other.id })).status, 400);
    await request(`${path}/${first}`, instructor.cookie, 'PATCH', { isVisible: true });
    const dashboard = await request(`/${course.id}/dashboard`, student.cookie);
    assert.ok(dashboard.data.recentAnnouncements.some((item: { title: string }) => item.title === 'Edited'));
  });
  await t.test('archived courses stay admin-only and reject every announcement mutation', async () => {
    const archivedPath = `/${archived.id}/announcements`;
    assert.equal((await request(archivedPath, student.cookie)).status, 403);
    assert.equal((await request(archivedPath, admin.cookie)).status, 200);
    assert.equal((await request(archivedPath, admin.cookie, 'POST', { title: 'No', body: 'No' })).status, 403);
    assert.equal((await request(`${archivedPath}/${old.id}`, admin.cookie, 'PATCH', { title: 'No' })).status, 403);
    assert.equal((await request(`${archivedPath}/${old.id}`, admin.cookie, 'DELETE')).status, 403);
    assert.equal((await prisma.announcement.findUniqueOrThrow({ where: { id: old.id } })).title, 'Archived');
  });
  await t.test('deletion is scoped and returns an empty response for successful requests', async () => {
    assert.equal((await request(`${path}/${first}`, student.cookie, 'DELETE')).status, 403);
    assert.equal((await request(`${path}/${foreign.id}`, admin.cookie, 'DELETE')).status, 403);
    assert.ok(await prisma.announcement.findUnique({ where: { id: foreign.id } }));
    const deleted = await request(`${path}/${first}`, instructor.cookie, 'DELETE');
    assert.equal(deleted.status, 204);
    assert.equal(deleted.data, undefined);
    assert.equal((await request(`${path}/${first}`, instructor.cookie, 'GET')).status, 404);
    assert.equal((await request(`${path}/${first}`, instructor.cookie, 'DELETE')).status, 404);
  });
});
