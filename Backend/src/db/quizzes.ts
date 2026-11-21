import { Prisma } from '../../generated/prisma/client';
import { getPrisma } from '../database';
import { HttpError } from '../errors';
import type { QuizData, QuizUpdateData, QuizQuestionData, QuizAnswers, QuizQuestionMarks, QuizListOptions } from '../types';

const student = { select: { id: true, name: true, email: true } };

export const quizDb = {
  // Group quiz mutations and attempt reservations in one database transaction.
  write: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => getPrisma().$transaction(operation),

  // Lock only the quiz while changing its definition or reserving an attempt.
  lock: async (tx: Prisma.TransactionClient, courseId: number, id: number) => {
    await tx.$queryRaw`SELECT quiz_id FROM learnflow.quizzes WHERE quiz_id = ${id} AND course_id = ${courseId} FOR UPDATE`;
  },

  // Serialize one student's quiz attempt and grading changes without locking the course.
  lockStudent: async (tx: Prisma.TransactionClient, quizId: number, studentId: number) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${quizId}::integer, ${-studentId}::integer)::text`;
  },

  // List visible course quizzes with optional upcoming or active dashboard filters and database limits.
  list: (tx: Prisma.TransactionClient, courseId: number, manage: boolean, options: QuizListOptions = {}) => tx.quiz.findMany({
    where: { courseId, ...(manage ? {} : { isVisible: true, status: { not: 'draft' } }),
      ...(options.dueAfter ? { dueAt: { gte: options.dueAfter }, status: manage ? { not: 'closed' } : 'published' } : {}),
      ...(options.activeAt ? { isVisible: true, status: 'published',
        AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: options.activeAt } }] },
          { OR: [{ dueAt: null }, { dueAt: { gte: options.activeAt } }] }] } : {}) },
    orderBy: options.dueAfter || options.activeAt ? [{ dueAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit,
  }),

  // Fetch only a student's latest attempt status for each requested dashboard quiz.
  ownSubmissionStates: (tx: Prisma.TransactionClient, courseId: number, userId: number, quizIds: number[]) => tx.submission.findMany({
    where: { courseId, studentId: userId, quizId: { in: quizIds } },
    select: { quizId: true, status: true }, distinct: ['quizId'], orderBy: { attemptNumber: 'desc' },
  }),

  // Fetch distinct finalized submission states for currently enrolled active students.
  submissionStates: (tx: Prisma.TransactionClient, courseId: number, quizIds: number[]) => tx.submission.findMany({
    where: { courseId, quizId: { in: quizIds }, status: { in: ['submitted', 'graded'] },
      student: { isActive: true, enrollments: { some: { courseId, role: 'student' } } } },
    select: { quizId: true, studentId: true, status: true }, distinct: ['quizId', 'studentId', 'status'],
  }),

  // Load one course-scoped quiz with ordered questions and private grading keys.
  find: (tx: Prisma.TransactionClient, courseId: number, id: number) => tx.quiz.findFirst({
    where: { id, courseId }, include: { questions: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  }),

  // Create a quiz attributed to its authenticated instructor or administrator.
  create: async (tx: Prisma.TransactionClient, courseId: number, createdBy: number, data: QuizData) => {
    try { return await tx.quiz.create({ data: { courseId, createdBy, ...data } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new HttpError(409, 'Course or creator is no longer available');
      throw error;
    }
  },

  // Update quiz availability and result settings after service validation.
  update: (tx: Prisma.TransactionClient, courseId: number, id: number, data: QuizUpdateData) =>
    tx.quiz.update({ where: { id, courseId }, data }),

  // Delete a quiz only after the service verifies that no attempt history exists.
  remove: (tx: Prisma.TransactionClient, courseId: number, id: number) => tx.quiz.delete({ where: { id, courseId } }),

  // Count all reserved and finalized attempts to preserve their history.
  attempts: (tx: Prisma.TransactionClient, courseId: number, quizId: number) => tx.submission.count({ where: { courseId, quizId } }),

  // Insert or replace a question while mapping API types to stored fields.
  saveQuestion: async (tx: Prisma.TransactionClient, courseId: number, quizId: number, position: number, data: QuizQuestionData, id?: number) => {
    const fields = { questionType: data.type, prompt: data.prompt, options: data.options ?? Prisma.DbNull,
      answerKey: data.answerKey ?? Prisma.DbNull, allowMultiple: data.allowMultiple, points: data.points };
    const question = id === undefined
      ? await tx.quizQuestion.create({ data: { courseId, quizId, position, ...fields } })
      : await tx.quizQuestion.update({ where: { id, courseId, quizId }, data: fields });
    await tx.quiz.update({ where: { id: quizId }, data: { updatedAt: new Date() } });
    return question;
  },

  // Remove a question and update its quiz revision without renumbering stable positions.
  removeQuestion: async (tx: Prisma.TransactionClient, courseId: number, quizId: number, id: number) => {
    await tx.quizQuestion.delete({ where: { id, courseId, quizId } });
    await tx.quiz.update({ where: { id: quizId }, data: { updatedAt: new Date() } });
  },

  // Load the latest reserved or finalized attempt for one student.
  latest: (tx: Prisma.TransactionClient, courseId: number, quizId: number, studentId: number) =>
    tx.submission.findFirst({ where: { courseId, quizId, studentId }, orderBy: { attemptNumber: 'desc' }, include: { student } }),

  // Reserve a numbered draft attempt with the current student's answers.
  createDraft: (tx: Prisma.TransactionClient, courseId: number, quizId: number, studentId: number, attemptNumber: number, answers: QuizAnswers) =>
    tx.submission.create({ data: { courseId, quizId, studentId, attemptNumber, draftAnswers: answers }, include: { student } }),

  // Load one attempt only within the requested quiz and course.
  submission: (tx: Prisma.TransactionClient, courseId: number, quizId: number, id: number) =>
    tx.submission.findFirst({ where: { id, courseId, quizId }, include: { student } }),

  // Save draft answers only before the submission has been finalized.
  saveDraft: (tx: Prisma.TransactionClient, id: number, answers: QuizAnswers) =>
    tx.submission.update({ where: { id, status: 'draft' }, data: { draftAnswers: answers }, include: { student } }),

  // Persist the immutable answer snapshot and its automatic grading outcome.
  finalize: (tx: Prisma.TransactionClient, id: number, answers: QuizAnswers, key: string, marks: QuizQuestionMarks, score: number | null) =>
    tx.submission.update({ where: { id, status: 'draft' }, data: { draftAnswers: answers, s3Key: key, questionMarks: marks,
      score, status: score === null ? 'submitted' : 'graded', submittedAt: new Date(), gradedAt: score === null ? null : new Date() }, include: { student } }),

  // List each student's latest finalized attempt with public student identity.
  submissions: (tx: Prisma.TransactionClient, courseId: number, quizId: number) => tx.submission.findMany({
    where: { courseId, quizId, status: { not: 'draft' } }, orderBy: [{ studentId: 'asc' }, { attemptNumber: 'desc' }], distinct: ['studentId'], include: { student },
  }),

  // List a student's attempt history without exposing another student's work.
  own: (tx: Prisma.TransactionClient, courseId: number, quizId: number, studentId: number) => tx.submission.findMany({
    where: { courseId, quizId, studentId }, orderBy: { attemptNumber: 'desc' }, include: { student },
  }),

  // Load active enrolled student IDs for course-specific quiz submission statistics.
  eligibleStudents: (tx: Prisma.TransactionClient, courseId: number) => tx.enrollment.findMany({
    where: { courseId, role: 'student', user: { isActive: true } }, select: { userId: true },
  }),

  // Save manual question marks and update aggregate grading status and provenance.
  grade: (tx: Prisma.TransactionClient, id: number, marks: QuizQuestionMarks, score: number | null, grader: number, feedback?: string | null) =>
    tx.submission.update({ where: { id }, data: { questionMarks: marks, score, status: score === null ? 'submitted' : 'graded',
      gradedBy: grader, gradedAt: score === null ? null : new Date(), ...(feedback === undefined ? {} : { feedback }) }, include: { student } }),
};
