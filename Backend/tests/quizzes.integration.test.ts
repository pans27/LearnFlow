import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { signAuthToken } from '../src/auth/jwt';

test('quiz attempts, grading, answer privacy, and instructor review', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const name = `learnflow_quizzes_${process.pid}_${Date.now()}`;
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
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, encoding: 'utf8', timeout: 60000 });
  assert.equal(migrated.status, 0, `${migrated.stdout}\n${migrated.stderr}`);
  const { getPrisma, closeDatabase } = await import('../src/database');
  cleanup = closeDatabase;
  const { default: app } = await import('../src/app');
  const { config } = await import('../src/config');
  const prisma = getPrisma();
  // Provision an account with a verified database-backed session for API requests.
  const account = async (label: string, isAdmin = false) => {
    const user = await prisma.user.create({ data: { email: `${label}@example.test`, name: label, passwordHash: 'test-only', mustChangePassword: false, isAdmin } });
    const expiresAt = new Date(Date.now() + 60000);
    const session = await prisma.session.create({ data: { id: `quiz-${user.id}`, userId: user.id, expiresAt } });
    return { ...user, cookie: `${config.authCookie}=${signAuthToken({ sid: session.id, uid: user.id }, config.jwtSecret, expiresAt)}` };
  };
  Object.assign(config.s3, { region: 'us-east-1', bucket: 'test', accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
  const objects = new Map<string, string>();
  const commands: unknown[] = [];
  let storageError: Error | undefined;
  let afterPut: (() => Promise<void>) | undefined;
  t.mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    commands.push(command);
    if (storageError) throw storageError;
    if (command instanceof PutObjectCommand) { objects.set(command.input.Key!, String(command.input.Body)); await afterPut?.(); }
    if (command instanceof DeleteObjectCommand) objects.delete(command.input.Key!);
    if (command instanceof GetObjectCommand) return { Body: Readable.from([Buffer.from(objects.get(command.input.Key!)!)]) };
    return {};
  });
  const admin = await account('admin', true);
  const instructor = await account('instructor');
  const student = await account('student');
  const peer = await account('peer');
  const outsider = await account('outsider');
  const course = await prisma.course.create({ data: { name: 'Quizzes', courseCode: 'Q' } });
  const other = await prisma.course.create({ data: { name: 'Other', courseCode: 'O' } });
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
  // Send quiz requests using a verified session and an optional JSON body.
  const request = async (path: string, cookie?: string, method = 'GET', body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/courses${path}`, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };
  const path = `/${course.id}/quizzes`;
  let quizId: number;
  let single: number;
  let multiple: number;
  let text: number;
  let manual: number;
  let first: number;
  let second: number;
  let answers: Record<string, string | string[]>;
  await t.test('instructors manage questions and students cannot see drafts or answer keys', async () => {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, outsider.cookie)).status, 403);
    assert.equal((await request(path, student.cookie, 'POST', { title: 'No' })).status, 403);
    assert.equal((await request(path, instructor.cookie, 'POST', { title: 'Empty', status: 'published' })).status, 409);
    const created = await request(path, instructor.cookie, 'POST', { title: 'Quiz', maxAttempts: 2 });
    assert.equal(created.status, 201);
    quizId = created.data.id;
    assert.deepEqual((await request(path, student.cookie)).data, []);
    assert.equal((await request(`${path}/${quizId}`, student.cookie)).status, 404);
    // Add a question and return its generated integer identifier.
    const add = async (body: unknown) => {
      const result = await request(`${path}/${quizId}/questions`, instructor.cookie, 'POST', body);
      assert.equal(result.status, 201);
      return result.data.id;
    };
    single = await add({ type: 'multiple_choice', prompt: 'Pick one', options: ['A', 'B'], answerKey: ['A'], points: 2 });
    multiple = await add({ type: 'multiple_choice', prompt: 'Pick all', options: ['X', 'Y', 'Z'], allowMultiple: true, answerKey: ['X', 'Z'], points: 3 });
    text = await add({ type: 'short_answer', prompt: 'Exact text', answerKey: 'PostgreSQL', points: 2 });
    manual = await add({ type: 'short_answer', prompt: 'Explain', points: 5 });
    const spare = await add({ type: 'short_answer', prompt: 'Delete me' });
    assert.equal((await request(`${path}/${quizId}/questions/${spare}`, instructor.cookie, 'DELETE')).status, 204);
    assert.equal((await request(`${path}/${quizId}/questions/${manual}`, instructor.cookie, 'PATCH', { type: 'short_answer', prompt: 'Explain your answer', points: 5 })).status, 200);
    assert.equal((await request(`${path}/${quizId}`, instructor.cookie, 'PATCH', { status: 'published', isVisible: true })).status, 200);
    const visible = await request(`${path}/${quizId}`, student.cookie);
    assert.equal(visible.status, 200);
    assert.equal(visible.data.questions.length, 4);
    assert.equal(JSON.stringify(visible.data).includes('answerKey'), false);
    assert.equal((await request(`/${other.id}/quizzes/${quizId}`, admin.cookie)).status, 404);
    answers = { [single]: ['A'], [multiple]: ['Z', 'X'], [text]: ' PostgreSQL ', [manual]: 'An explanation' };
  });
  await t.test('draft saves reserve one attempt and enforce question and selection integrity', async () => {
    assert.equal((await request(`${path}/${quizId}/draft`, student.cookie)).data, null);
    assert.equal((await request(`${path}/${quizId}/draft`, student.cookie, 'PUT', { answers: { [single]: ['A', 'B'] } })).status, 400);
    assert.equal((await request(`${path}/${quizId}/draft`, student.cookie, 'PUT', { answers: { [multiple]: ['Unknown'] } })).status, 400);
    const draft = await request(`${path}/${quizId}/draft`, student.cookie, 'PUT', { answers });
    assert.equal(draft.status, 200);
    first = draft.data.id;
    assert.equal(draft.data.attemptNumber, 1);
    assert.equal((await request(`${path}/${quizId}/draft`, student.cookie, 'PUT', { answers })).data.id, first);
    assert.deepEqual((await request(`${path}/${quizId}/draft`, student.cookie)).data.answers, answers);
    assert.equal((await request(`${path}/${quizId}/questions`, instructor.cookie, 'POST', { type: 'short_answer', prompt: 'Too late' })).status, 409);
    assert.equal((await request(`${path}/${quizId}`, instructor.cookie, 'DELETE')).status, 409);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}`, peer.cookie)).status, 403);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}`, instructor.cookie)).status, 403);
  });
  await t.test('finalization archives immutable answers and grades only questions with keys', async () => {
    const result = await request(`${path}/${quizId}/submissions/${first}/submit`, student.cookie, 'POST', { answers });
    assert.equal(result.status, 201);
    assert.equal(result.data.id, first);
    assert.equal(result.data.score, null);
    assert.equal(result.data.questionMarks, null);
    const row = await prisma.submission.findUniqueOrThrow({ where: { id: first } });
    assert.equal(row.status, 'submitted');
    const marks = row.questionMarks as Record<string, { mark: number }>;
    assert.equal(marks[single].mark, 2);
    assert.equal(marks[multiple].mark, 3);
    assert.equal(marks[text].mark, 2);
    assert.equal(marks[manual], undefined);
    assert.deepEqual(JSON.parse(objects.get(row.s3Key!)!), answers);
    assert.ok(commands.some((command) => command instanceof PutObjectCommand && command.input.ContentType === 'application/json'));
    assert.equal((await request(`${path}/${quizId}/submissions/${first}/result`, student.cookie)).status, 403);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}`, student.cookie, 'PATCH', { answers })).status, 409);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}/submit`, student.cookie, 'POST', { answers })).status, 409);
    assert.equal((await request(`${path}/${quizId}/submissions`, student.cookie)).status, 403);
  });
  await t.test('manual marks merge with automatic credit and result release protects all views', async () => {
    const gradePath = `${path}/${quizId}/submissions/${first}/grade`;
    assert.equal((await request(gradePath, student.cookie, 'PATCH', { grades: [{ questionId: manual, mark: 4 }] })).status, 403);
    assert.equal((await request(gradePath, instructor.cookie, 'PATCH', { grades: [{ questionId: manual, mark: 6 }] })).status, 400);
    const graded = await request(gradePath, instructor.cookie, 'PATCH', { grades: [{ questionId: manual, mark: 4.5 }], feedback: 'Good' });
    assert.equal(graded.status, 200);
    assert.equal(graded.data.score, 11.5);
    assert.equal(graded.data.status, 'graded');
    assert.equal((await request(`${path}/${quizId}/submissions/me`, student.cookie)).data[0].score, null);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}`, student.cookie)).data.feedback, null);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}/result`, instructor.cookie)).data.score, 11.5);
    await request(`${path}/${quizId}`, instructor.cookie, 'PATCH', { showResults: true });
    const visible = await request(`${path}/${quizId}/submissions/${first}/result`, student.cookie);
    assert.equal(visible.status, 200);
    assert.equal(visible.data.score, 11.5);
    assert.deepEqual(visible.data.answers, answers);
    assert.equal(visible.data.questionMarks[manual].source, 'manual');
    assert.equal('s3Key' in visible.data, false);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}/result`, peer.cookie)).status, 403);
    assert.equal(JSON.stringify((await request(`${path}/${quizId}`, student.cookie)).data).includes('answerKey'), false);
  });
  await t.test('concurrent finalizations enforce attempt limits and manager review identifies latest submissions', async () => {
    const results = await Promise.all([
      request(`${path}/${quizId}/submissions`, student.cookie, 'POST', { answers: { ...answers, [multiple]: ['X'] } }),
      request(`${path}/${quizId}/submissions`, student.cookie, 'POST', { answers }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    second = results.find((r) => r.status === 201)!.data.id;
    assert.equal(await prisma.submission.count({ where: { quizId, studentId: student.id } }), 2);
    assert.equal((await request(`${path}/${quizId}/draft`, student.cookie, 'PUT', { answers })).status, 409);
    const peerResult = await request(`${path}/${quizId}/submissions`, peer.cookie, 'POST', { answers });
    assert.equal(peerResult.status, 201);
    const review = await request(`${path}/${quizId}/submissions`, instructor.cookie);
    assert.equal(review.status, 200);
    assert.deepEqual(review.data.map((item: { id: number }) => item.id), [second, peerResult.data.id]);
    assert.equal(review.data[0].attemptNumber, 2);
    assert.equal(review.data[0].student.email, student.email);
    assert.deepEqual((await request(`${path}/${quizId}/submissions/me`, student.cookie)).data.map((item: { id: number }) => item.id), [second, first]);
    const statistics = await request(`${path}/${quizId}/statistics`, instructor.cookie);
    assert.equal(statistics.data.submittedCount, 2);
    assert.equal(statistics.data.eligibleStudents, 2);
    assert.equal(statistics.data.submissionRate, 1);
    assert.equal((await request(`${path}/${quizId}/statistics`, student.cookie)).status, 403);
  });
  await t.test('fully keyed questions grade immediately using exact option-set equality', async () => {
    const created = await request(path, instructor.cookie, 'POST', { title: 'Automatic', maxAttempts: 2, showResults: true });
    const target = `${path}/${created.data.id}`;
    const question = await request(`${target}/questions`, instructor.cookie, 'POST', { type: 'multiple_choice', prompt: 'All required', options: ['A', 'B', 'C'], allowMultiple: true, answerKey: ['A', 'B'], points: 5 });
    await request(target, instructor.cookie, 'PATCH', { isVisible: true, status: 'published' });
    const wrong = await request(`${target}/submissions`, student.cookie, 'POST', { answers: { [question.data.id]: ['A'] } });
    assert.equal(wrong.status, 201);
    assert.equal(wrong.data.score, 0);
    assert.equal(wrong.data.status, 'graded');
    const correct = await request(`${target}/submissions`, student.cookie, 'POST', { answers: { [question.data.id]: ['B', 'A'] } });
    assert.equal(correct.data.score, 5);
  });
  await t.test('unkeyed choice and textbox questions support partial manual grading without losing automatic zeros', async () => {
    const created = await request(path, instructor.cookie, 'POST', { title: 'Manual grading', showResults: true });
    const target = `${path}/${created.data.id}`;
    const choice = await request(`${target}/questions`, instructor.cookie, 'POST', { type: 'multiple_choice', prompt: 'Explain choice', options: ['A', 'B'], points: 2 });
    const textbox = await request(`${target}/questions`, instructor.cookie, 'POST', { type: 'short_answer', prompt: 'Explain text', points: 3 });
    const keyed = await request(`${target}/questions`, instructor.cookie, 'POST', { type: 'short_answer', prompt: 'Case sensitive', answerKey: 'SQL', points: 1 });
    await request(target, instructor.cookie, 'PATCH', { isVisible: true, status: 'published' });
    const submitted = await request(`${target}/submissions`, peer.cookie, 'POST', { answers: { [choice.data.id]: ['A'], [textbox.data.id]: 'Text', [keyed.data.id]: 'sql' } });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.data.score, null);
    assert.equal(submitted.data.questionMarks[keyed.data.id].mark, 0);
    const gradePath = `${target}/submissions/${submitted.data.id}/grade`;
    const partial = await request(gradePath, instructor.cookie, 'PATCH', { grades: [{ questionId: choice.data.id, mark: 2 }] });
    assert.equal(partial.status, 200);
    assert.equal(partial.data.score, null);
    assert.equal(partial.data.status, 'submitted');
    assert.equal(partial.data.questionMarks[keyed.data.id].mark, 0);
    const complete = await request(gradePath, instructor.cookie, 'PATCH', { grades: [{ questionId: textbox.data.id, mark: 2.5 }] });
    assert.equal(complete.status, 200);
    assert.equal(complete.data.score, 4.5);
    assert.equal(complete.data.status, 'graded');
  });
  await t.test('storage failures preserve drafts and deadline changes clean uncommitted files', async (t) => {
    t.mock.method(console, 'error', () => {});
    const created = await request(path, instructor.cookie, 'POST', { title: 'Upload failure' });
    const target = `${path}/${created.data.id}`;
    const question = await request(`${target}/questions`, instructor.cookie, 'POST', { type: 'short_answer', prompt: 'Answer' });
    await request(target, instructor.cookie, 'PATCH', { isVisible: true, status: 'published' });
    const payload = { answers: { [question.data.id]: 'Answer' } };
    const saved = await request(`${target}/draft`, student.cookie, 'PUT', payload);
    storageError = new Error('S3 unavailable');
    try { assert.equal((await request(`${target}/submissions`, student.cookie, 'POST', payload)).status, 500); }
    finally { storageError = undefined; }
    assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: saved.data.id } })).status, 'draft');
    const offset = commands.length;
    afterPut = async () => { await prisma.quiz.update({ where: { id: created.data.id }, data: { dueAt: new Date('2000-01-01T00:00:00Z') } }); };
    try { assert.equal((await request(`${target}/submissions`, student.cookie, 'POST', payload)).status, 409); }
    finally { afterPut = undefined; }
    const [put, removed] = commands.slice(offset);
    assert.ok(put instanceof PutObjectCommand && removed instanceof DeleteObjectCommand);
    assert.equal(put.input.Key, removed.input.Key);
    assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: saved.data.id } })).status, 'draft');
    assert.equal((await request(`${target}/draft`, student.cookie, 'PUT', payload)).status, 409);
    await request(target, instructor.cookie, 'PATCH', { dueAt: null, opensAt: '2099-01-01T00:00:00Z' });
    assert.equal((await request(`${target}/submissions`, student.cookie, 'POST', payload)).status, 409);
    await request(target, instructor.cookie, 'PATCH', { opensAt: null, status: 'closed' });
    assert.equal((await request(`${target}/submissions`, student.cookie, 'POST', payload)).status, 409);
  });
  await t.test('archived courses reject mutations while administrators retain history access', async () => {
    await prisma.course.update({ where: { id: course.id }, data: { status: 'archived' } });
    assert.equal((await request(path, student.cookie)).status, 403);
    assert.equal((await request(`${path}/${quizId}`, admin.cookie, 'PATCH', { showResults: false })).status, 403);
    assert.equal((await request(`${path}/${quizId}/submissions/${first}/grade`, admin.cookie, 'PATCH', { grades: [{ questionId: manual, mark: 4 }] })).status, 403);
    assert.equal((await request(`${path}/${quizId}/submissions`, admin.cookie)).status, 200);
  });
});
