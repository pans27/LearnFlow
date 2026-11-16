import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
import type { CourseBody } from '../src/types';

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
  const createUser = (email: string, isAdmin = false, mustChangePassword = false) =>
    prisma.user.create({ data: { email, name: email, passwordHash: 'test-only-invalid-hash', isAdmin, mustChangePassword } });
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
  const base = `http://127.0.0.1:${address.port}/api/admin`;
  // Send an HTTP request to the test API and parse its response.
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? undefined : await response.json();
    return { status: response.status, data };
  };

  await t.test('admin filter allows requests without a session', async () => {
    assert.equal((await request('/courses')).status, 200);
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
    assert.deepEqual(await request('/users', 'POST', {}), {
      status: 501, data: { message: 'User provisioning awaits authentication integration' },
    });
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
    const batchUser = await createUser('batch@example.test');
    const other = await prisma.course.create({ data: { name: 'Separate', courseCode: 'OTHER' } });
    await prisma.enrollment.create({ data: { courseId: other.id, userId: student.id, role: 'student' } });
    assert.equal((await request(`${path}/bulk`, 'POST', { enrollments: [
      { userId: student.id, role: 'student' }, { userId: admin.id, role: 'instructor' },
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
    assert.equal((await request(`${path}/bulk-remove`, 'POST', { userIds: [student.id, admin.id] })).status, 204);
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
});
