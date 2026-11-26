import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { signAuthToken } from '../src/auth/jwt';

test('resource API authorization, storage, and dashboard visibility', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const name = `learnflow_resources_${process.pid}_${Date.now()}`;
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
  const course = await prisma.course.create({ data: { name: 'Resources', courseCode: 'R' } });
  const other = await prisma.course.create({ data: { name: 'Other', courseCode: 'O' } });
  const archived = await prisma.course.create({ data: { name: 'Archived', courseCode: 'X', status: 'archived' } });
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
  // Send a resource API request with an optional verified session and multipart body.
  const request = async (path: string, cookie?: string, method = 'GET', body?: FormData) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/courses${path}`, {
      method, headers: cookie ? { Cookie: cookie } : {}, body,
    });
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };
  // Build a fresh multipart PDF request for each upload.
  const pdf = (resourceType = 'student_note', visibility = 'visible') => {
    const body = new FormData();
    body.set('file', new Blob(['%PDF-1.4\nTest PDF'], { type: 'application/pdf' }), 'notes.pdf');
    body.set('title', ' Course notes ');
    body.set('resourceType', resourceType);
    body.set('visibility', visibility);
    return body;
  };
  const path = `/${course.id}/resources`;
  let shared: number;
  let privateNote: number;
  let hiddenMaterial: number;
  await t.test('uploads require authentication, membership, and the appropriate resource role', async () => {
    assert.deepEqual(await request(path), { status: 401, data: { message: 'Unauthorized' } });
    assert.deepEqual(await request(path, outsider.cookie), { status: 403, data: { message: 'Forbidden' } });
    assert.equal((await request(path, student.cookie, 'POST', pdf('instructor_material'))).status, 403);
    assert.equal((await request(`/${archived.id}/resources`, admin.cookie, 'POST', pdf())).status, 403);
    assert.equal(commands.length, 0);
    const uploaded = await request(path, student.cookie, 'POST', pdf());
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.data.title, 'Course notes');
    assert.equal(uploaded.data.ownerId, student.id);
    assert.equal(uploaded.data.extractionStatus, 'pending');
    assert.equal(uploaded.data.visibility, 'visible');
    shared = uploaded.data.id;
    const row = await prisma.learningResource.findUniqueOrThrow({ where: { id: shared } });
    assert.equal(row.originalFilename, 'notes.pdf');
    assert.equal(row.s3Key, uploaded.data.fileKey);
    assert.equal(await prisma.extractionJob.count({ where: { resourceId: shared, courseId: course.id } }), 1);
    const put = commands[0];
    assert.ok(put instanceof PutObjectCommand);
    assert.equal(put.input.Key, row.s3Key);
    assert.equal(put.input.ContentType, 'application/pdf');
    assert.equal(row.fileSizeBytes, BigInt((put.input.Body as Buffer).length));
    privateNote = (await request(path, student.cookie, 'POST', pdf('student_note', 'hidden'))).data.id;
    hiddenMaterial = (await request(path, instructor.cookie, 'POST', pdf('instructor_material', 'hidden'))).data.id;
  });
  await t.test('resource reads and dashboard enforce the same private-file visibility', async () => {
    for (const [user, expected] of [[student, [shared, privateNote]], [peer, [shared]],
      [instructor, [shared, hiddenMaterial]], [admin, [shared, hiddenMaterial]]] as const) {
      const list = await request(path, user.cookie);
      assert.equal(list.status, 200);
      assert.deepEqual(list.data.map((item: { id: number }) => item.id).sort(), [...expected].sort());
      const dashboard = await request(`/${course.id}/dashboard`, user.cookie);
      assert.equal(dashboard.status, 200);
      assert.deepEqual(dashboard.data.recentResources.map((item: { id: number }) => item.id).sort(), [...expected].sort());
      assert.equal(JSON.stringify(dashboard.data.recentResources).includes('fileKey'), false);
      assert.equal(JSON.stringify(dashboard.data.recentResources).includes('s3Key'), false);
    }
    assert.equal((await request(`${path}/${privateNote}`, peer.cookie)).status, 404);
    assert.equal((await request(`/${other.id}/resources/${shared}`, admin.cookie)).status, 404);
    assert.equal((await request(`${path}?resourceType=bad`, student.cookie)).status, 400);
    const filtered = await request(`${path}?resourceType=instructor_material`, instructor.cookie);
    assert.deepEqual(filtered.data.map((item: { id: number }) => item.id), [hiddenMaterial]);
  });
  await t.test('preview and download authorize access before issuing short-lived URLs', async () => {
    assert.equal((await request(`${path}/${privateNote}/preview`, peer.cookie)).status, 404);
    assert.equal((await request(`${path}/${privateNote}/download`, instructor.cookie)).status, 404);
    assert.equal((await request(`${path}/${shared}/preview`, outsider.cookie)).status, 403);
    for (const action of ['preview', 'download']) {
      const before = Date.now();
      const result = await request(`${path}/${privateNote}/${action}`, student.cookie);
      assert.equal(result.status, 200);
      const url = new URL(result.data.url);
      assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
      assert.equal(url.searchParams.get('response-content-disposition'), `${action === 'preview' ? 'inline' : 'attachment'}; filename="notes.pdf"`);
      assert.ok(Date.parse(result.data.expiresAt) >= before + 299000);
      assert.ok(Date.parse(result.data.expiresAt) <= Date.now() + 300000);
    }
  });
  await t.test('failed storage writes create no database records and failed database writes clean up the uploaded PDF', async () => {
    const count = await prisma.learningResource.count();
    storageError = new Error('Simulated S3 failure');
    t.mock.method(console, 'error', () => {});
    try {
      assert.equal((await request(path, student.cookie, 'POST', pdf())).status, 500);
    } finally { storageError = undefined; }
    assert.equal(await prisma.learningResource.count(), count);
    const offset = commands.length;
    afterPut = async () => { await prisma.course.update({ where: { id: course.id }, data: { status: 'archived' } }); };
    try {
      assert.equal((await request(path, student.cookie, 'POST', pdf())).status, 403);
    } finally {
      afterPut = undefined;
      await prisma.course.update({ where: { id: course.id }, data: { status: 'active' } });
    }
    assert.equal(await prisma.learningResource.count(), count);
    const [put, removed] = commands.slice(offset);
    assert.ok(put instanceof PutObjectCommand);
    assert.ok(removed instanceof DeleteObjectCommand);
    assert.equal(removed.input.Key, put.input.Key);
  });
  await t.test('instructor material upload rechecks enrollment role after S3 completes', async () => {
    const count = await prisma.learningResource.count();
    const offset = commands.length;
    afterPut = async () => {
      await prisma.enrollment.update({ where: { courseId_userId: { courseId: course.id, userId: instructor.id } }, data: { role: 'student' } });
    };
    try {
      assert.equal((await request(path, instructor.cookie, 'POST', pdf('instructor_material'))).status, 403);
    } finally {
      afterPut = undefined;
      await prisma.enrollment.update({ where: { courseId_userId: { courseId: course.id, userId: instructor.id } }, data: { role: 'instructor' } });
    }
    assert.equal(await prisma.learningResource.count(), count);
    const [put, removed] = commands.slice(offset);
    assert.ok(put instanceof PutObjectCommand && removed instanceof DeleteObjectCommand);
    assert.equal(put.input.Key, removed.input.Key);
  });
  await t.test('PDF search enforces visibility and course boundaries and returns page snippets', async () => {
    const foreign = await prisma.learningResource.create({ data: { courseId: other.id, ownerId: instructor.id,
      resourceType: 'instructor_material', title: 'Other course', originalFilename: 'other.pdf', s3Key: 'other/search.pdf' } });
    for (const resourceId of [shared, privateNote, hiddenMaterial, foreign.id]) {
      await prisma.resourcePage.createMany({ data: [1, 2].map((pageNumber) => ({
        courseId: resourceId === foreign.id ? other.id : course.id, resourceId, pageNumber,
        extractedText: `PostgreSQL transactions resource ${resourceId} page ${pageNumber}`,
      })) });
    }
    const search = `${path}/search?q=PostgreSQL`;
    assert.equal((await request(search)).status, 401);
    assert.equal((await request(search, outsider.cookie)).status, 403);
    for (const [user, expected] of [[student, [shared, privateNote]], [peer, [shared]],
      [instructor, [shared, hiddenMaterial]], [admin, [shared, hiddenMaterial]]] as const) {
      const response = await request(search, user.cookie);
      assert.equal(response.status, 200);
      assert.deepEqual(response.data.map((item: { resource: { id: number } }) => item.resource.id).sort(), [...expected].sort());
      for (const item of response.data) {
        assert.deepEqual(item.matches.map((match: { page: number }) => match.page), [1, 2]);
        assert.ok(item.matches.every((match: { snippet: string }) => match.snippet.includes('PostgreSQL') && !match.snippet.includes('<b>')));
      }
    }
    assert.deepEqual((await request(`${path}/search?q=unmatchedword`, student.cookie)).data, []);
    assert.equal((await request(`${path}/search`, student.cookie)).status, 400);
    assert.equal((await request(`${path}/search?q=one&q=two`, student.cookie)).status, 400);
    assert.equal((await request(`${path}/search?q=${encodeURIComponent("'; SELECT 1; --")}`, student.cookie)).status, 200);
  });
  await t.test('deletion enforces ownership and removes resource metadata, jobs, and S3 data', async () => {
    const offset = commands.length;
    assert.equal((await request(`${path}/${shared}`, peer.cookie, 'DELETE')).status, 403);
    assert.equal((await request(`${path}/${privateNote}`, instructor.cookie, 'DELETE')).status, 404);
    assert.equal(commands.length, offset);
    const row = await prisma.learningResource.findUniqueOrThrow({ where: { id: privateNote } });
    assert.equal((await request(`${path}/${privateNote}`, student.cookie, 'DELETE')).status, 204);
    assert.equal(await prisma.learningResource.count({ where: { id: privateNote } }), 0);
    assert.equal(await prisma.extractionJob.count({ where: { resourceId: privateNote } }), 0);
    const removed = commands.at(-1);
    assert.ok(removed instanceof DeleteObjectCommand);
    assert.equal(removed.input.Key, row.s3Key);
    assert.equal((await request(`${path}/${shared}`, instructor.cookie, 'DELETE')).status, 204);
    assert.equal((await request(`${path}/${hiddenMaterial}`, instructor.cookie, 'DELETE')).status, 204);
  });
});
