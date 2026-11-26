import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
import { hashPassword, verifyPassword } from '../src/auth/password';
import type { CourseBody } from '../src/types';
import { scryptSync, timingSafeEqual } from 'node:crypto';

// Opt in with the URL of a local PostgreSQL account allowed to CREATE DATABASE.
// Tests create/migrate/drop a uniquely named database; no existing tables are reset.
test('admin API and single-schema database integrity', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 120000,
}, async (t) => {
  const databaseName = `learnflow_test_${process.pid}_${Date.now()}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const management = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  t.after(async () => {
    if (created) await management.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await management.end();
  });
  await management.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  url.pathname = `/${databaseName}`;
  url.searchParams.set('schema', 'learnflow');
  process.env.DATABASE_URL = url.toString();
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(migrated.status, 0, `${migrated.stdout}\n${migrated.stderr}`);

  const { getPrisma, closeDatabase } = await import('../src/database');
  const { default: app } = await import('../src/app');
  const { adminService } = await import('../src/services/admin');
  const prisma = getPrisma();
  // Insert a test account with the requested account flags.
  const password = 'AdminIntegrationPassword123!';
  const createUser = async (email: string, isAdmin = false, mustChangePassword = false) =>
    prisma.user.create({ data: { email, name: email, passwordHash: await hashPassword(password), isAdmin, mustChangePassword } });
  const admin = await createUser('admin@example.test', true);
  const student = await createUser('student@example.test');
  const temporary = await createUser('temporary@example.test', true, true);
  const inactive = await createUser('inactive@example.test', true);
  await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const base = `${origin}/api/admin`;
  let cookie = '';
  // Sign in through the actual auth endpoint and retain its session cookie.
  const login = async (email: string, loginPassword = password) => {
    const response = await fetch(`${origin}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: loginPassword }) });
    assert.equal(response.status, 200);
    cookie = response.headers.getSetCookie()[0].split(';')[0];
  };
  // Send an HTTP request to the test API and parse its response.
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? undefined : await response.json();
    return { status: response.status, data };
  };

  await t.test('admin routes require a valid session and fresh administrator account flags', async () => {
    assert.deepEqual(await request('/courses'), { status: 401, data: { message: 'Unauthorized' } });
    await login(student.email);
    assert.deepEqual(await request('/courses'), { status: 403, data: { message: 'Forbidden' } });
    assert.equal((await request('/users', 'POST', { name: 'Blocked', email: 'blocked@example.test' })).status, 403);
    assert.equal(await prisma.user.count({ where: { email: 'blocked@example.test' } }), 0);
    await login(temporary.email);
    assert.deepEqual(await request('/courses'), { status: 403, data: { message: 'Forbidden' } });
    await login(admin.email);
    const adminCookie = cookie;
    assert.equal((await request('/courses')).status, 200);
    await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: false } });
    assert.deepEqual(await request('/courses'), { status: 403, data: { message: 'Forbidden' } });
    await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true, isActive: false } });
    assert.deepEqual(await request('/courses'), { status: 401, data: { message: 'Unauthorized' } });
    await prisma.user.update({ where: { id: admin.id }, data: { isActive: true, mustChangePassword: true } });
    assert.deepEqual(await request('/courses'), { status: 403, data: { message: 'Forbidden' } });
    await prisma.user.update({ where: { id: admin.id }, data: { mustChangePassword: false } });
    const loggedOut = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { Cookie: adminCookie } });
    assert.equal(loggedOut.status, 204);
    assert.deepEqual(await request('/courses'), { status: 401, data: { message: 'Unauthorized' } });
    await login(admin.email);
  });

  let courseId: number;
  await t.test('course create/update, field validation, integer IDs, and safe user responses', async () => {
    const invalid = await request('/courses', 'POST', { name: ' ' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.data, { message: 'name must be nonempty text of at most 200 characters' });
    assert.equal((await request('/courses', 'POST', { name: 'x', isAdmin: true })).status, 400);
    const body: CourseBody = { name: 'Software', courseCode: 'ECE1724', description: 'First course' };
    const created = await request('/courses', 'POST', body);
    assert.equal(created.status, 201);
    assert.equal(typeof created.data.id, 'number');
    courseId = created.data.id;
    assert.equal((await request(`/courses/${courseId}`, 'PATCH', { name: 'Software engineering' })).status, 200);
    assert.deepEqual(await request('/courses/9223372036854775808', 'PATCH', { name: 'x' }), {
      status: 400, data: { message: 'Invalid ID' },
    });
    assert.equal((await request('/courses/999999999', 'PATCH', { name: 'x' })).status, 404);
    const users = await request('/users');
    assert.equal(users.status, 200);
    assert.equal(JSON.stringify(users.data).includes('passwordHash'), false);
    assert.equal((await request(`/users/${student.id}`, 'PATCH', { name: 'New name' })).data.name, 'New name');
    assert.equal((await request('/users', 'POST', {})).status, 400);
    assert.deepEqual(await request('/unknown'), { status: 404, data: { message: 'Not found' } });
  });

  await t.test('enrollment lifecycle, duplicate conflict, and archived-course protection', async () => {
    const path = `/courses/${courseId}/enrollments`;
    assert.equal((await request(path)).data.length, 0);
    assert.equal((await request(path, 'POST', { userId: 999999999, role: 'student' })).status, 404);
    assert.equal((await request(path, 'POST', { userId: inactive.id, role: 'student' })).status, 409);
    assert.equal((await request(path, 'POST', { userId: student.id, role: 'student' })).status, 201);
    assert.equal((await request(path, 'POST', { userId: student.id, role: 'student' })).status, 409);
    assert.equal((await request(`${path}/${student.id}`, 'PATCH', { role: 'instructor' })).data.role, 'instructor');
    const announcement = await prisma.announcement.create({ data: {
      courseId: courseId, authorId: student.id, title: 'History', body: 'Retain me',
    } });
    assert.equal((await request(`/courses/${courseId}/status`, 'PATCH', { status: 'archived' })).status, 200);
    assert.equal((await request(path)).status, 200);
    assert.equal((await request(`/courses/${courseId}`, 'PATCH', { name: 'Blocked' })).status, 409);
    assert.equal((await request(`${path}/${student.id}`, 'DELETE')).status, 409);
    assert.equal((await request(`/courses/${courseId}/status`, 'PATCH', { status: 'active' })).status, 200);
    assert.equal((await request(`${path}/${student.id}`, 'DELETE')).status, 204);
    assert.ok(await prisma.announcement.findUnique({ where: { id: announcement.id } }));
    assert.equal((await request(`${path}/${student.id}`, 'DELETE')).status, 404);
    assert.equal((await request('/courses/999999999/enrollments')).status, 404);
  });

  await t.test('bulk membership changes are atomic and scoped to the selected active course', async () => {
    const path = `/courses/${courseId}/enrollments`;
    const courseInstructor = await createUser('bulk-instructor@example.test');
    const batchUser = await createUser('batch@example.test');
    const other = await prisma.course.create({ data: { name: 'Separate', courseCode: 'OTHER' } });
    await prisma.enrollment.create({ data: { courseId: other.id, userId: student.id, role: 'student' } });
    assert.equal((await request(`${path}/bulk`, 'POST', { enrollments: [
      { userId: student.id, role: 'student' }, { userId: courseInstructor.id, role: 'instructor' },
    ] })).status, 201);
    assert.equal((await request(path)).data.length, 2);
    assert.equal((await request(`${path}/bulk`, 'POST', { enrollments: [
      { userId: batchUser.id, role: 'student' }, { userId: student.id, role: 'student' },
    ] })).status, 409);
    assert.equal(await prisma.enrollment.count({ where: { courseId: courseId, userId: batchUser.id } }), 0);
    assert.equal((await request(`${path}/bulk-remove`, 'POST', { userIds: [student.id, 999999999] })).status, 404);
    assert.equal((await request(path)).data.length, 2);
    await request(`/courses/${courseId}/status`, 'PATCH', { status: 'archived' });
    assert.equal((await request(`${path}/bulk-remove`, 'POST', { userIds: [student.id] })).status, 409);
    assert.equal((await request(`${path}/bulk`, 'POST', { enrollments: [{ userId: batchUser.id, role: 'student' }] })).status, 409);
    await request(`/courses/${courseId}/status`, 'PATCH', { status: 'active' });
    assert.equal((await request(`${path}/bulk-remove`, 'POST', { userIds: [student.id, courseInstructor.id] })).status, 204);
    assert.equal((await request(path)).data.length, 0);
    assert.equal(await prisma.enrollment.count({ where: { courseId: other.id, userId: student.id } }), 1);
  });

  await t.test('database checks and composite foreign keys prevent inconsistent course data', async () => {
    await assert.rejects(createUser('ADMIN@example.test'));
    const second = await prisma.course.create({ data: { name: 'Other', courseCode: 'OTHER' } });
    const resource = await prisma.learningResource.create({ data: {
      courseId: courseId, ownerId: admin.id, resourceType: 'instructor_material',
      title: 'Notes', originalFilename: 'notes.pdf', s3Key: 'test/notes.pdf',
    } });
    await assert.rejects(prisma.resourcePage.create({ data: {
      courseId: second.id, resourceId: resource.id, pageNumber: 1, extractedText: 'cross-course leak',
    } }));
    await prisma.resourcePage.create({ data: {
      courseId: courseId, resourceId: resource.id, pageNumber: 1, extractedText: 'PostgreSQL integrity constraints',
    } });
    const matches = await prisma.$queryRaw<{ page_number: number }[]>`
      SELECT page_number FROM learnflow.resource_pages
      WHERE course_id = ${courseId} AND search_vector @@ websearch_to_tsquery('english', 'integrity')
    `;
    assert.equal(matches.length, 1);
    await assert.rejects(prisma.quiz.create({ data: {
      courseId: courseId, createdBy: admin.id, title: 'Invalid', maxAttempts: 0,
    } }));
    const quiz = await prisma.quiz.create({ data: { courseId: courseId, createdBy: admin.id, title: 'Quiz' } });
    await assert.rejects(prisma.submission.create({ data: {
      courseId: courseId, quizId: quiz.id, studentId: student.id, status: 'submitted',
    } }));
    await assert.rejects(prisma.enrollment.create({ data: { courseId: second.id, userId: student.id, role: 'admin' } }));
  });

  await t.test('concurrent demotions cannot remove the last active administrator', async () => {
    await prisma.user.update({ where: { id: temporary.id }, data: { isAdmin: false } });
    await prisma.user.update({ where: { id: student.id }, data: { isAdmin: true } });
    const results = await Promise.allSettled([
      adminService.updateUser(admin.id, { isAdmin: false }),
      adminService.updateUser(student.id, { isAdmin: false }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.user.count({ where: { isAdmin: true, isActive: true } }), 1);
  });

  await t.test('default administrator seeding is idempotent and stores a verifiable salted hash', async () => {
    const { seedDefaultAdmin } = await import('../src/db/seed-admin');
    const password = 'TestOnlySeedPassword123!';
    const seeded = await seedDefaultAdmin({ email: 'seed@example.test', password });
    assert.equal(seeded.created, true);
    assert.equal(seeded.temporaryPassword, password);
    const record = await prisma.user.findUniqueOrThrow({ where: { id: seeded.id } });
    assert.equal(record.isAdmin, true);
    assert.equal(record.isActive, true);
    assert.equal(record.mustChangePassword, true);
    assert.notEqual(record.passwordHash, password);
    const [algorithm, n, r, p, salt, key] = record.passwordHash.split('$');
    assert.equal(algorithm, 'scrypt');
    assert.ok(timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) })));
    const repeated = await seedDefaultAdmin({ email: 'SEED@example.test', password: 'DoNotReplacePassword123!' });
    assert.equal(repeated.created, false);
    assert.equal(repeated.id, record.id);
    assert.equal(repeated.temporaryPassword, undefined);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: record.id } })).passwordHash, record.passwordHash);
    const normal = await createUser('collision@example.test');
    await assert.rejects(seedDefaultAdmin({ email: normal.email }));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: normal.id } })).isAdmin, false);
  });
  await t.test('administrators provision users with working temporary passwords and required reset', async () => {
    const activeAdmin = await prisma.user.findFirstOrThrow({ where: { isAdmin: true, isActive: true, mustChangePassword: false } });
    await login(activeAdmin.email);
    assert.equal((await request('/users', 'POST', { name: 'Invalid', email: 'bad' })).status, 400);
    assert.equal((await request('/users', 'POST', { name: 'Invalid', email: 'valid@example.test', password: 'Forbidden' })).status, 400);
    const response = await fetch(`${base}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Created User', email: ' Created@Example.test ', isAdmin: true }) });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    assert.equal(result.user.email, 'created@example.test');
    assert.equal(result.user.isAdmin, true);
    assert.equal(result.user.mustChangePassword, true);
    assert.equal('passwordHash' in result.user, false);
    assert.ok(result.temporaryPassword.length >= 16);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: result.user.id } });
    assert.equal(await verifyPassword(result.temporaryPassword, stored.passwordHash), true);
    assert.equal((await request('/users', 'POST', { name: 'Duplicate', email: 'CREATED@EXAMPLE.TEST' })).status, 409);
    await login(result.user.email, result.temporaryPassword);
    assert.deepEqual(await request('/courses'), { status: 403, data: { message: 'Forbidden' } });
    const changed = await fetch(`${origin}/api/auth/change-password`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: result.temporaryPassword, newPassword: 'ReplacementPassword123!' }) });
    assert.equal(changed.status, 204);
    assert.deepEqual(await request('/courses'), { status: 401, data: { message: 'Unauthorized' } });
    await login(result.user.email, 'ReplacementPassword123!');
    assert.equal((await request('/courses')).status, 200);
  });

  await t.test('administrators are separate from course members and course APIs are read-only', async () => {
    const isolatedAdmin = await createUser('readonly-admin@example.test', true);
    const learner = await createUser('membership-candidate@example.test');
    const course = await prisma.course.create({ data: { name: 'Account separation', courseCode: 'SEP' } });
    await login(isolatedAdmin.email);
    const enroll = `/courses/${course.id}/enrollments`;
    assert.equal((await request(enroll, 'POST', { userId: isolatedAdmin.id, role: 'student' })).status, 409);
    assert.equal((await request(`${enroll}/bulk`, 'POST', { enrollments: [
      { userId: learner.id, role: 'student' }, { userId: isolatedAdmin.id, role: 'instructor' },
    ] })).status, 409);
    assert.equal(await prisma.enrollment.count({ where: { courseId: course.id } }), 0);
    assert.equal((await request(enroll, 'POST', { userId: learner.id, role: 'student' })).status, 201);
    assert.equal((await request(`/users/${learner.id}`, 'PATCH', { isAdmin: true })).status, 409);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: learner.id } })).isAdmin, false);
    // An existing legacy membership never grants an administrator teaching permissions.
    await prisma.enrollment.create({ data: { courseId: course.id, userId: isolatedAdmin.id, role: 'instructor' } });
    assert.equal((await request(`${enroll}/${isolatedAdmin.id}`, 'PATCH', { role: 'student' })).status, 409);
    for (const section of ['announcements', 'quizzes', 'assignments', 'resources']) {
      for (const [method, suffix] of [['POST', ''], ['PATCH', '/1'], ['DELETE', '/1']] as const) {
        const response = await fetch(`${origin}/api/courses/${course.id}/${section}${suffix}`, {
          method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
        });
        assert.equal(response.status, 403, `${method} ${section}`);
      }
      const response = await fetch(`${origin}/api/courses/${course.id}/${section}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
    }
    const dashboard = await fetch(`${origin}/api/courses/${course.id}/dashboard`, { headers: { Cookie: cookie } });
    const view = await dashboard.json();
    assert.equal(view.readOnly, true);
    assert.equal(view.course.role, null);
    assert.ok(Object.values(view.permissions).every((value) => value === false));
    assert.equal((await request(`${enroll}/${isolatedAdmin.id}`, 'DELETE')).status, 204);
    assert.equal((await request(`${enroll}/${learner.id}`, 'DELETE')).status, 204);
    assert.equal((await request(`/users/${learner.id}`, 'PATCH', { isAdmin: true })).status, 200);
  });

});
