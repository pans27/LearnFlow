import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import express from 'express';
import pg from 'pg';
import type { SessionRequest, UserSession } from '../src/types';

test('session-based course access and role-aware dashboards', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 120000,
}, async (t) => {
  const name = `learnflow_courses_${process.pid}_${Date.now()}`;
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
  const migrate = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(migrate.status, 0, `${migrate.stdout}\n${migrate.stderr}`);
  const { getPrisma, closeDatabase } = await import('../src/database');
  cleanup = closeDatabase;
  const { default: app } = await import('../src/app');
  const prisma = getPrisma();

  // Create an account used only by this isolated integration database.
  const account = (email: string, isAdmin = false, isActive = true, mustChangePassword = false) =>
    prisma.user.create({ data: { email, name: email, passwordHash: 'test-only-invalid-hash', isAdmin, isActive, mustChangePassword } });
  const admin = await account('admin@example.test', true);
  const instructor = await account('instructor@example.test');
  const student = await account('student@example.test');
  const secondStudent = await account('second@example.test');
  const former = await account('former@example.test');
  const inactive = await account('inactive@example.test', false, false);
  const temporary = await account('temporary@example.test', false, true, true);
  const outsider = await account('outsider@example.test');
  const course = await prisma.course.create({ data: { name: 'Main course', courseCode: 'A' } });
  const other = await prisma.course.create({ data: { name: 'Other course', courseCode: 'B' } });
  const archived = await prisma.course.create({ data: { name: 'Archived course', courseCode: 'C', status: 'archived' } });
  const empty = await prisma.course.create({ data: { name: 'Empty course', courseCode: 'D' } });
  await prisma.enrollment.createMany({ data: [
    { courseId: course.id, userId: instructor.id, role: 'instructor' },
    ...[student, secondStudent, inactive].map((user) => ({ courseId: course.id, userId: user.id, role: 'student' })),
    { courseId: archived.id, userId: student.id, role: 'student' },
    { courseId: empty.id, userId: student.id, role: 'student' },
  ] });
  const day = 86400000;
  const now = Date.now();
  // Build a future timestamp for deterministic upcoming-assessment fixtures.
  const future = (days: number) => new Date(now + day * days);
  await prisma.announcement.createMany({ data: [
    ...Array.from({ length: 7 }, (_, index) => ({ courseId: course.id, authorId: instructor.id,
      title: `Visible ${index}`, body: `Full announcement ${index}`, createdAt: new Date(now - day + index * 1000) })),
    { courseId: course.id, authorId: instructor.id, title: 'Hidden announcement', body: 'Private draft', isVisible: false, createdAt: new Date(now) },
    { courseId: other.id, authorId: instructor.id, title: 'Other course announcement', body: 'Never leak' },
  ] });
  const assignment = await prisma.assignment.create({ data: { courseId: course.id, createdBy: instructor.id,
    title: 'Visible assignment', dueAt: future(1), isVisible: true } });
  await prisma.assignment.createMany({ data: [
    { courseId: course.id, createdBy: instructor.id, title: 'Hidden assignment', dueAt: future(2), isVisible: false },
    { courseId: course.id, createdBy: instructor.id, title: 'Past assignment', dueAt: new Date(now - day), isVisible: true },
    { courseId: course.id, createdBy: instructor.id, title: 'No deadline assignment', isVisible: true },
    { courseId: other.id, createdBy: instructor.id, title: 'Other assignment', dueAt: future(1), isVisible: true },
  ] });
  const quiz = await prisma.quiz.create({ data: { courseId: course.id, createdBy: instructor.id,
    title: 'Active quiz', dueAt: future(1.5), status: 'published', isVisible: true, maxAttempts: 3 } });
  await prisma.quizQuestion.create({ data: { courseId: course.id, quizId: quiz.id, position: 0,
    questionType: 'short_answer', prompt: 'Question', answerKey: { secret: 'Never expose this' } } });
  await prisma.quiz.createMany({ data: [
    { courseId: course.id, createdBy: instructor.id, title: 'Draft quiz', dueAt: future(3), status: 'draft', isVisible: true },
    { courseId: course.id, createdBy: instructor.id, title: 'Hidden quiz', dueAt: future(4), status: 'published', isVisible: false },
    { courseId: course.id, createdBy: instructor.id, title: 'Closed quiz', dueAt: future(4), status: 'closed', isVisible: true },
    { courseId: course.id, createdBy: instructor.id, title: 'Future quiz', opensAt: future(5), dueAt: future(6), status: 'published', isVisible: true },
    { courseId: other.id, createdBy: instructor.id, title: 'No eligible students', status: 'published', isVisible: true },
  ] });
  await prisma.submission.createMany({ data: [
    { courseId: course.id, quizId: quiz.id, studentId: student.id, attemptNumber: 1, status: 'submitted', s3Key: 'private/attempt-1' },
    { courseId: course.id, quizId: quiz.id, studentId: student.id, attemptNumber: 2, status: 'graded', s3Key: 'private/attempt-2', score: 1 },
    { courseId: course.id, quizId: quiz.id, studentId: secondStudent.id, status: 'draft' },
    ...[former, inactive, instructor].map((user) => ({ courseId: course.id, quizId: quiz.id, studentId: user.id,
      status: 'submitted', s3Key: `private/${user.id}` })),
  ] });
  await prisma.assignmentSubmission.create({ data: { courseId: course.id, assignmentId: assignment.id,
    studentId: student.id, s3Key: 'private/assignment', originalFilename: 'submission.pdf' } });
  await prisma.learningResource.createMany({ data: [
    { title: 'Lecture', ownerId: instructor.id, resourceType: 'instructor_material', isVisible: true },
    { title: 'Hidden lecture', ownerId: instructor.id, resourceType: 'instructor_material', isVisible: false },
    { title: 'Shared note', ownerId: secondStudent.id, resourceType: 'student_note', isVisible: true },
    { title: 'My private note', ownerId: student.id, resourceType: 'student_note', isVisible: false },
    { title: 'Peer private note', ownerId: secondStudent.id, resourceType: 'student_note', isVisible: false },
    { title: 'Instructor private note', ownerId: instructor.id, resourceType: 'student_note', isVisible: false },
  ].map((item, index) => ({ ...item, courseId: course.id, originalFilename: 'file.pdf', s3Key: `private/resource-${index}` })) });
  await prisma.learningResource.create({ data: { courseId: other.id, ownerId: instructor.id,
    title: 'Other resource', resourceType: 'instructor_material', originalFilename: 'other.pdf', s3Key: 'private/other' } });

  // Simulate a session store in tests without adding a production identity bypass.
  const sessions = new Map<string, UserSession>([admin, instructor, student, secondStudent, inactive, temporary, outsider]
    .map((user) => [String(user.id), { currentUser: { id: user.id } }]));
  const harness = express();
  harness.use((req, _res, next) => {
    const token = req.headers.cookie?.match(/testSession=([^;]+)/)?.[1];
    if (token) (req as SessionRequest).session = sessions.get(token);
    next();
  });
  harness.use(app);
  const server = harness.listen(0, '127.0.0.1');
  cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await closeDatabase();
  };
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  // Fetch a course endpoint using an optional test session cookie.
  const request = async (path: string, userId?: number) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/courses${path}`, {
      headers: userId === undefined ? {} : { Cookie: `testSession=${userId}` },
    });
    return { status: response.status, data: await response.json() };
  };

  await t.test('session framework requires a current active account and password reset completion', async () => {
    assert.deepEqual(await request(''), { status: 401, data: { message: 'Unauthorized' } });
    assert.deepEqual(await request(`?userId=${student.id}`), { status: 401, data: { message: 'Unauthorized' } });
    assert.deepEqual(await request('', inactive.id), { status: 401, data: { message: 'Unauthorized' } });
    assert.deepEqual(await request('', temporary.id), { status: 403, data: { message: 'Forbidden' } });
  });
  await t.test('course listing and reads enforce enrollment, archived-course restrictions, and admin access', async () => {
    const listed = await request('', student.id);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.data.map((item: { id: number }) => item.id), [course.id, empty.id]);
    assert.equal(listed.data[0].role, 'student');
    assert.equal((await request(`/${course.id}`, instructor.id)).data.role, 'instructor');
    assert.deepEqual((await request('', outsider.id)).data, []);
    assert.deepEqual(await request(`/${course.id}`, outsider.id), { status: 403, data: { message: 'Forbidden' } });
    assert.deepEqual(await request(`/${archived.id}`, student.id), { status: 403, data: { message: 'Forbidden' } });
    assert.equal((await request(`/${other.id}`, admin.id)).status, 200);
    assert.equal((await request('/9999999', student.id)).status, 404);
    assert.equal((await request('/bad', student.id)).status, 400);
    assert.deepEqual((await request('', admin.id)).data, []);
    await prisma.enrollment.create({ data: { courseId: empty.id, userId: admin.id, role: 'instructor' } });
    const adminCourses = await request('', admin.id);
    assert.deepEqual(adminCourses.data.map((item: { id: number }) => item.id), [empty.id]);
    assert.equal(adminCourses.data[0].role, 'instructor');
    const archivedCourse = await request(`/${archived.id}`, admin.id);
    assert.equal(archivedCourse.status, 200);
    assert.equal(archivedCourse.data.role, null);
  });
  await t.test('students see visible updates, their own submission state, and no instructor statistics', async () => {
    const result = await request(`/${course.id}/dashboard`, student.id);
    assert.equal(result.status, 200);
    assert.equal(result.data.view, 'student');
    assert.equal(result.data.recentAnnouncements.length, 5);
    assert.equal(result.data.recentAnnouncements[0].title, 'Visible 6');
    assert.equal(result.data.recentAnnouncements[0].body, 'Full announcement 6');
    assert.deepEqual(result.data.upcomingAssessments.map((item: { title: string }) => item.title),
      ['Visible assignment', 'Active quiz', 'Future quiz']);
    assert.deepEqual(result.data.upcomingAssessments.map((item: { submissionStatus: string }) => item.submissionStatus),
      ['submitted', 'graded', 'not_started']);
    assert.deepEqual(new Set(result.data.recentResources.map((item: { title: string }) => item.title)),
      new Set(['Lecture', 'Shared note', 'My private note']));
    assert.equal('activeAssessmentStatistics' in result.data, false);
    assert.ok(Object.values(result.data.permissions).every((value) => value === false));
    const serialized = JSON.stringify(result.data);
    for (const secret of ['answerKey', 'draftAnswers', 'private/', 's3Key', 'passwordHash', 'score']) {
      assert.equal(serialized.includes(secret), false, secret);
    }
  });
  await t.test('instructors see drafts, management permissions, and unique-student active-quiz rates', async () => {
    const result = await request(`/${course.id}/dashboard`, instructor.id);
    assert.equal(result.status, 200);
    assert.equal(result.data.view, 'instructor');
    assert.equal(result.data.recentAnnouncements[0].title, 'Hidden announcement');
    assert.ok(result.data.upcomingAssessments.some((item: { title: string }) => item.title === 'Draft quiz'));
    assert.ok(Object.values(result.data.permissions).every((value) => value === true));
    assert.equal(result.data.activeAssessmentStatistics.length, 3);
    assert.deepEqual(result.data.activeAssessmentStatistics.find((item: { type: string }) => item.type === 'quiz'), {
      assessmentId: quiz.id, type: 'quiz', title: quiz.title, eligibleStudents: 2, submittedCount: 1, gradedCount: 1, submissionRate: 0.5,
    });
    const assignmentRate = result.data.activeAssessmentStatistics.find((item: { title: string }) => item.title === 'Visible assignment');
    assert.equal(assignmentRate.submissionRate, 0.5);
    assert.equal(assignmentRate.gradedCount, null);
    const resources = result.data.recentResources.map((item: { title: string }) => item.title);
    assert.ok(resources.includes('Hidden lecture'));
    assert.ok(resources.includes('Instructor private note'));
    assert.equal(resources.includes('Peer private note'), false);
    assert.equal(resources.includes('My private note'), false);
    assert.equal(result.data.upcomingAssessments.some((item: object) => 'submissionStatus' in item), false);
  });
  await t.test('empty dashboards, zero-student rates, and archived admin dashboards remain well-defined', async () => {
    const result = await request(`/${empty.id}/dashboard`, student.id);
    assert.deepEqual(result.data.recentAnnouncements, []);
    assert.deepEqual(result.data.upcomingAssessments, []);
    assert.deepEqual(result.data.recentResources, []);
    const zeroStudents = await request(`/${other.id}/dashboard`, admin.id);
    assert.equal(zeroStudents.data.activeAssessmentStatistics[0].eligibleStudents, 0);
    assert.equal(zeroStudents.data.activeAssessmentStatistics[0].submissionRate, 0);
    const archivedDashboard = await request(`/${archived.id}/dashboard`, admin.id);
    assert.equal(archivedDashboard.status, 200);
    assert.equal(archivedDashboard.data.readOnly, true);
    assert.ok(Object.values(archivedDashboard.data.permissions).every((value) => value === false));
    assert.deepEqual(await request(`/${course.id}/dashboard`, outsider.id), { status: 403, data: { message: 'Forbidden' } });
  });
});
