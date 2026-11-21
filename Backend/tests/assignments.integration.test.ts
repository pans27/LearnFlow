import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { signAuthToken } from '../src/auth/jwt';

test('assignment lifecycle and latest student submissions', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const name = `learnflow_assignments_${process.pid}_${Date.now()}`;
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
    const session = await prisma.session.create({ data: { id: `resource-${user.id}`, userId: user.id, expiresAt } });
    return { ...user, cookie: `${config.authCookie}=${signAuthToken({ sid: session.id, uid: user.id }, config.jwtSecret, expiresAt)}` };
  };
  Object.assign(config.s3, { region: 'us-east-1', bucket: 'learnflow-test', accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' });
  const commands: unknown[] = [];
  let storageError: Error | undefined;
  let afterPut: (() => Promise<void>) | undefined;
  t.mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    commands.push(command);
    if (storageError) throw storageError;
    if (command instanceof PutObjectCommand) await afterPut?.();
    return {};
  });
  const admin = await account('admin', true);
  const instructor = await account('instructor');
  const student = await account('student');
  const peer = await account('peer');
  const outsider = await account('outsider');
  const course = await prisma.course.create({ data: { name: 'Assignments', courseCode: 'A' } });
  const other = await prisma.course.create({ data: { name: 'Other', courseCode: 'B' } });
  await prisma.enrollment.createMany({ data: [
    { courseId: course.id, userId: instructor.id, role: 'instructor' },
    { courseId: course.id, userId: student.id, role: 'student' },
    { courseId: course.id, userId: peer.id, role: 'student' },
  ] });
  const server = app.listen(0, '127.0.0.1');
  cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
  };
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  // Send assignment requests with a signed session and JSON or multipart content.
  const request = async (path: string, cookie?: string, method = 'GET', body?: unknown) => {
    const form = body instanceof FormData;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/courses${path}`, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };
  // Create a fresh PDF request with a recognizable filename for each submission.
  const pdf = (filename = 'answer.pdf') => {
    const body = new FormData();
    body.set('file', new Blob(['%PDF-1.4\nAnswer'], { type: 'application/pdf' }), filename);
    return body;
  };
  const path = `/${course.id}/assignments`;
  let assignmentId: number;
  let submissionId: number;
  await t.test('instructors manage hidden assignments while students see only published assignments', async () => {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, outsider.cookie)).status, 403);
    assert.equal((await request(path, student.cookie, 'POST', { title: 'No' })).status, 403);
    assert.equal((await request(path, instructor.cookie, 'POST', { title: 'Bad', studentId: peer.id })).status, 400);
    const created = await request(path, instructor.cookie, 'POST', { title: ' Homework ', description: 'Read and answer' });
    assert.equal(created.status, 201);
    assignmentId = created.data.id;
    assert.equal(created.data.title, 'Homework');
    assert.equal(created.data.isVisible, false);
    assert.equal(created.data.allowResubmission, false);
    assert.equal(created.data.createdBy, instructor.id);
    assert.deepEqual((await request(path, student.cookie)).data, []);
    assert.equal((await request(`${path}/${assignmentId}`, student.cookie)).status, 404);
    assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf())).status, 404);
    assert.equal((await request(`/${other.id}/assignments/${assignmentId}`, admin.cookie)).status, 404);
    const published = await request(`${path}/${assignmentId}`, instructor.cookie, 'PATCH', { isVisible: true });
    assert.equal(published.status, 200);
    assert.equal((await request(path, student.cookie)).data.length, 1);
  });
  await t.test('simultaneous first submissions cannot bypass disabled resubmission', async () => {
    const results = await Promise.all([
      request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf('first.pdf')),
      request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf('other.pdf')),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const success = results.find((r) => r.status === 200)!;
    submissionId = success.data.id;
    assert.equal(success.data.studentId, student.id);
    assert.deepEqual(success.data.student, { id: student.id, name: student.name, email: student.email });
    assert.equal('s3Key' in success.data, false);
    assert.equal(await prisma.assignmentSubmission.count({ where: { assignmentId, studentId: student.id } }), 1);
    assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf())).status, 409);
    assert.equal((await request(`${path}/${assignmentId}/submissions`, instructor.cookie, 'POST', pdf())).status, 403);
  });
  await t.test('allowed reuploads replace the current file and instructors see one identified submission per student', async () => {
    const before = await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    assert.equal((await request(`${path}/${assignmentId}`, instructor.cookie, 'PATCH', { allowResubmission: true })).status, 200);
    const replaced = await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf('latest.pdf'));
    assert.equal(replaced.status, 200);
    assert.equal(replaced.data.id, submissionId);
    assert.equal(replaced.data.originalFilename, 'latest.pdf');
    assert.ok(Date.parse(replaced.data.submittedAt) > before.submittedAt.getTime());
    const latest = await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    assert.notEqual(latest.s3Key, before.s3Key);
    assert.ok(commands.some((command) => command instanceof DeleteObjectCommand && command.input.Key === before.s3Key));
    assert.equal((await request(`${path}/${assignmentId}/submissions`, peer.cookie, 'POST', pdf('peer.pdf'))).status, 200);
    const list = await request(`${path}/${assignmentId}/submissions`, instructor.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.data.length, 2);
    assert.deepEqual(list.data.map((item: { studentId: number }) => item.studentId), [student.id, peer.id]);
    assert.equal(list.data[0].student.email, student.email);
    assert.equal(list.data[0].originalFilename, 'latest.pdf');
    assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie)).status, 403);
    assert.equal((await request(`${path}/${assignmentId}/submissions/me`, student.cookie)).data.id, submissionId);
    assert.equal((await request(`${path}/${assignmentId}/submissions/${submissionId}/download`, peer.cookie)).status, 403);
    for (const user of [student, instructor, admin]) {
      const download = await request(`${path}/${assignmentId}/submissions/${submissionId}/download`, user.cookie);
      assert.equal(download.status, 200);
      assert.ok(new URL(download.data.url).pathname.endsWith(latest.s3Key));
    }
    assert.equal((await request(`/${other.id}/assignments/${assignmentId}/submissions/${submissionId}/download`, admin.cookie)).status, 404);
  });
  await t.test('upload failures preserve the previous file and clean up uncommitted objects', async (t) => {
    t.mock.method(console, 'error', () => {});
    const previous = await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    storageError = new Error('S3 unavailable');
    try { assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf())).status, 500); }
    finally { storageError = undefined; }
    const offset = commands.length;
    afterPut = async () => { await prisma.assignment.update({ where: { id: assignmentId }, data: { allowResubmission: false } }); };
    try { assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf())).status, 409); }
    finally { afterPut = undefined; }
    const [put, removed] = commands.slice(offset);
    assert.ok(put instanceof PutObjectCommand && removed instanceof DeleteObjectCommand);
    assert.equal(put.input.Key, removed.input.Key);
    assert.equal((await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: submissionId } })).s3Key, previous.s3Key);
  });
  await t.test('deadlines and archived courses reject writes and assignments with submissions retain history', async () => {
    assert.equal((await request(`${path}/${assignmentId}`, instructor.cookie, 'DELETE')).status, 409);
    const empty = await request(path, admin.cookie, 'POST', { title: 'Empty' });
    assert.equal((await request(`${path}/${empty.data.id}`, admin.cookie, 'DELETE')).status, 204);
    await request(`${path}/${assignmentId}`, instructor.cookie, 'PATCH', { allowResubmission: true, dueAt: '2000-01-01T00:00:00Z' });
    assert.equal((await request(`${path}/${assignmentId}/submissions`, student.cookie, 'POST', pdf())).status, 409);
    await prisma.course.update({ where: { id: course.id }, data: { status: 'archived' } });
    assert.equal((await request(path, student.cookie)).status, 403);
    assert.equal((await request(`${path}/${assignmentId}`, admin.cookie, 'PATCH', { title: 'No' })).status, 409);
    assert.equal((await request(`${path}/${assignmentId}/submissions`, admin.cookie)).status, 200);
    assert.equal((await request(`${path}/${assignmentId}/submissions/${submissionId}/download`, admin.cookie)).status, 200);
  });
});
