import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, QuizData, QuizUpdateData, QuizQuestionData, QuizAnswers, QuizGradeData,
  QuizQuestionMarks, QuizQuestionRecord, QuizRecord, QuizWithQuestions, QuizAttemptRecord, QuizResponse,
  QuizQuestionResponse, QuizSubmissionResponse } from '../types';
import { quizDb as database } from '../db/quizzes';
import { courseDb } from '../db/courses';
import { requireCourseAccess } from './courses';
import { putQuizAnswers, getQuizAnswers, deleteObject } from '../storage/s3';
import { quizAnswersBody } from '../validation/quizzes';
import { HttpError } from '../errors';

// Restrict quiz mutations to active courses without introducing course locks.
function active(status: string): void {
  if (status !== 'active') throw new HttpError(409, 'Reactivate this course before changing it');
}

// Load a quiz and course role while hiding unpublished quizzes from students.
async function access(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser, manager = false, write = false) {
  const course = await requireCourseAccess(tx, courseId, user);
  const manage = user.isAdmin || course.role === 'instructor';
  if (manager && !manage) throw new HttpError(403, 'Forbidden');
  if (write) active(course.status);
  const quiz = await database.find(tx, courseId, id);
  if (!quiz || (!manage && (!quiz.isVisible || quiz.status === 'draft'))) throw new HttpError(404, 'Quiz not found');
  return { course, quiz, manage };
}

// Check student enrollment and the complete quiz availability window before any answer write.
async function writable(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser) {
  const context = await access(tx, courseId, id, user, false, true);
  if (context.course.role !== 'student') throw new HttpError(403, 'Forbidden');
  const { quiz } = context;
  if (!quiz.isVisible || quiz.status !== 'published') throw new HttpError(409, 'Quiz is not accepting submissions');
  if (quiz.opensAt && quiz.opensAt.getTime() > Date.now()) throw new HttpError(409, 'Quiz has not opened');
  if (quiz.dueAt && quiz.dueAt.getTime() <= Date.now()) throw new HttpError(409, 'Quiz deadline has passed');
  return context;
}

// Validate merged quiz dates and require questions before publication.
function validateSettings(quiz: QuizData | QuizWithQuestions): void {
  if (quiz.opensAt && quiz.dueAt && quiz.dueAt < quiz.opensAt) throw new HttpError(400, 'dueAt must not be before opensAt');
  if (quiz.status === 'published' && (!('questions' in quiz) || !quiz.questions.length)) throw new HttpError(409, 'Add questions before publishing the quiz');
}

// Serialize quiz metadata without exposing private answer keys to students.
function quizResponse(quiz: QuizRecord & { questions?: QuizQuestionRecord[] }, manage: boolean): QuizResponse {
  const { questions, ...metadata } = quiz;
  return { ...metadata, opensAt: quiz.opensAt?.toISOString() ?? null, dueAt: quiz.dueAt?.toISOString() ?? null,
    createdAt: quiz.createdAt.toISOString(), updatedAt: quiz.updatedAt.toISOString(),
    ...(questions ? { questions: questions.map((question) => questionResponse(question, manage)) } : {}) };
}

// Serialize one question with its answer key reserved for course managers.
function questionResponse(question: QuizQuestionRecord, manage: boolean): QuizQuestionResponse {
  return { id: question.id, position: question.position, type: question.questionType, prompt: question.prompt,
    options: question.options as string[] | null, allowMultiple: question.allowMultiple, points: Number(question.points),
    ...(manage ? { answerKey: question.answerKey as string | string[] | null } : {}) };
}

// Return attempt ownership and answers while hiding unreleased scores and feedback.
function submissionResponse(item: QuizAttemptRecord, reveal: boolean): QuizSubmissionResponse {
  return { id: item.id, courseId: item.courseId, quizId: item.quizId, studentId: item.studentId, attemptNumber: item.attemptNumber,
    status: reveal ? item.status : item.status === 'draft' ? 'draft' : 'submitted', answers: item.draftAnswers as QuizAnswers,
    score: reveal && item.score !== null ? Number(item.score) : null,
    questionMarks: reveal ? item.questionMarks as QuizQuestionMarks : null, feedback: reveal ? item.feedback : null,
    submittedAt: item.submittedAt?.toISOString() ?? null, updatedAt: item.updatedAt.toISOString(), student: item.student };
}

// Check each supplied answer against its question and permitted selection count.
function validateAnswers(questions: QuizQuestionRecord[], answers: QuizAnswers): void {
  for (const [key, value] of Object.entries(answers)) {
    const question = questions.find((item) => String(item.id) === key);
    if (!question) throw new HttpError(400, 'Answer references an unknown question');
    if (question.questionType === 'short_answer') {
      if (typeof value !== 'string') throw new HttpError(400, 'Textbox answers must be text');
    } else {
      const options = question.options as string[];
      if (!Array.isArray(value) || new Set(value).size !== value.length || (!question.allowMultiple && value.length > 1) || value.some((item) => !options.includes(item))) throw new HttpError(400, 'Invalid multiple choice selections');
    }
  }
}

// Assign full or zero automatic credit only to questions with supplied answer keys.
function automaticMarks(questions: QuizQuestionRecord[], answers: QuizAnswers): QuizQuestionMarks {
  const marks: QuizQuestionMarks = {};
  for (const question of questions) {
    if (question.answerKey === null) continue;
    const answer = answers[String(question.id)];
    const correct = question.questionType === 'short_answer'
      ? typeof answer === 'string' && answer.trim() === String(question.answerKey).trim()
      : Array.isArray(answer) && Array.isArray(question.answerKey) && answer.length === question.answerKey.length && answer.every((value) => (question.answerKey as string[]).includes(value));
    marks[String(question.id)] = { mark: correct ? Number(question.points) : 0, source: 'auto' };
  }
  return marks;
}

// Return the aggregate mark only when every question has been graded.
function total(questions: QuizQuestionRecord[], marks: QuizQuestionMarks): number | null {
  if (questions.some((question) => !marks[String(question.id)])) return null;
  return questions.reduce((cents, question) => cents + Math.round(marks[String(question.id)].mark * 100), 0) / 100;
}

// Prevent question mutations after an attempt has reserved the quiz definition.
async function editableQuestions(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser) {
  await database.lock(tx, courseId, id);
  const context = await access(tx, courseId, id, user, true, true);
  if (await database.attempts(tx, courseId, id)) throw new HttpError(409, 'Questions cannot change after an attempt has started');
  return context.quiz;
}

// Select a reusable draft or reserve the next permitted numbered attempt.
async function draft(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser, quiz: QuizWithQuestions, answers: QuizAnswers) {
  const latest = await database.latest(tx, courseId, id, user.id);
  if (latest?.status === 'draft') return latest;
  const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
  if (attemptNumber > quiz.maxAttempts) throw new HttpError(409, 'Quiz attempt limit reached');
  return database.createDraft(tx, courseId, id, user.id, attemptNumber, answers);
}

export const quizService = {
  // List quizzes visible to the current member without returning answer keys.
  list(courseId: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      const manage = user.isAdmin || course.role === 'instructor';
      return (await database.list(tx, courseId, manage)).map((quiz) => quizResponse(quiz, manage));
    });
  },

  // Return a quiz and its ordered questions with role-appropriate grading fields.
  get(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => { const { quiz, manage } = await access(tx, courseId, id, user); return quizResponse(quiz, manage); });
  },

  // Create a hidden draft quiz in a course managed by the caller.
  create(courseId: number, user: CurrentUser, data: QuizData) {
    return database.write(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      if (!user.isAdmin && course.role !== 'instructor') throw new HttpError(403, 'Forbidden');
      active(course.status);
      validateSettings(data);
      return quizResponse(await database.create(tx, courseId, user.id, data), true);
    });
  },

  // Update availability, attempt limits, publication, or result visibility for an existing quiz.
  update(courseId: number, id: number, user: CurrentUser, data: QuizUpdateData) {
    return database.write(async (tx) => {
      await database.lock(tx, courseId, id);
      const { quiz } = await access(tx, courseId, id, user, true, true);
      validateSettings({ ...quiz, ...data });
      return quizResponse(await database.update(tx, courseId, id, data), true);
    });
  },

  // Delete only quizzes without reserved or finalized attempts.
  remove(courseId: number, id: number, user: CurrentUser) {
    return database.write(async (tx) => {
      await editableQuestions(tx, courseId, id, user);
      await database.remove(tx, courseId, id);
    });
  },

  // Add or fully replace a question before any student attempt begins.
  saveQuestion(courseId: number, id: number, user: CurrentUser, data: QuizQuestionData, questionId?: number) {
    return database.write(async (tx) => {
      const quiz = await editableQuestions(tx, courseId, id, user);
      if (questionId !== undefined && !quiz.questions.some((q) => q.id === questionId)) throw new HttpError(404, 'Question not found');
      if (questionId === undefined && quiz.questions.length >= 100) throw new HttpError(409, 'Quiz question limit reached');
      const position = quiz.questions.length ? Math.max(...quiz.questions.map((q) => q.position)) + 1 : 0;
      return questionResponse(await database.saveQuestion(tx, courseId, id, position, data, questionId), true);
    });
  },

  // Remove a question before attempts exist without leaving a published quiz empty.
  removeQuestion(courseId: number, id: number, questionId: number, user: CurrentUser) {
    return database.write(async (tx) => {
      const quiz = await editableQuestions(tx, courseId, id, user);
      if (!quiz.questions.some((q) => q.id === questionId)) throw new HttpError(404, 'Question not found');
      if (quiz.status === 'published' && quiz.questions.length === 1) throw new HttpError(409, 'A published quiz must contain questions');
      await database.removeQuestion(tx, courseId, id, questionId);
    });
  },

  // Return the current student's saved draft without reserving a new attempt.
  getDraft(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      const { course } = await access(tx, courseId, id, user);
      if (course.role !== 'student') throw new HttpError(403, 'Forbidden');
      const item = await database.latest(tx, courseId, id, user.id);
      return item?.status === 'draft' ? submissionResponse(item, false) : null;
    });
  },

  // Save or replace draft answers while reserving at most one current attempt.
  saveDraft(courseId: number, id: number, user: CurrentUser, answers: QuizAnswers, submissionId?: number) {
    return database.write(async (tx) => {
      await database.lock(tx, courseId, id);
      await database.lockStudent(tx, id, user.id);
      const { quiz } = await writable(tx, courseId, id, user);
      validateAnswers(quiz.questions, answers);
      if (submissionId !== undefined) {
        const item = await database.submission(tx, courseId, id, submissionId);
        if (!item) throw new HttpError(404, 'Submission not found');
        if (item.studentId !== user.id) throw new HttpError(403, 'Forbidden');
        if (item.status !== 'draft') throw new HttpError(409, 'Finalized submissions cannot be changed');
        return submissionResponse(await database.saveDraft(tx, item.id, answers), false);
      }
      const item = await draft(tx, courseId, id, user, quiz, answers);
      if (item.attemptNumber > quiz.maxAttempts) throw new HttpError(409, 'Quiz attempt limit reached');
      return submissionResponse(await database.saveDraft(tx, item.id, answers), false);
    });
  },

  // Archive answers in S3 and finalize one validated attempt with automatic question marks.
  async submit(courseId: number, id: number, user: CurrentUser, answers?: QuizAnswers, submissionId?: number) {
    const prepared = await courseDb.read(async (tx) => {
      const { quiz } = await writable(tx, courseId, id, user);
      const item = submissionId === undefined ? await database.latest(tx, courseId, id, user.id) : await database.submission(tx, courseId, id, submissionId);
      if (submissionId !== undefined && !item) throw new HttpError(404, 'Submission not found');
      if (item && item.studentId !== user.id) throw new HttpError(403, 'Forbidden');
      if (submissionId !== undefined && item?.status !== 'draft') throw new HttpError(409, 'Submission is already finalized');
      const current = item?.status === 'draft' ? item : null;
      if ((current?.attemptNumber ?? (item?.attemptNumber ?? 0) + 1) > quiz.maxAttempts) throw new HttpError(409, 'Quiz attempt limit reached');
      const snapshot = answers ?? (current?.draftAnswers as QuizAnswers | undefined);
      if (!snapshot) throw new HttpError(400, 'answers are required');
      validateAnswers(quiz.questions, snapshot);
      return { quiz, current, answers: snapshot };
    });
    const key = `quizzes/${courseId}/${id}/${user.id}/${randomUUID()}.json`;
    await putQuizAnswers(key, prepared.answers);
    try {
      return await database.write(async (tx) => {
        await database.lock(tx, courseId, id);
        await database.lockStudent(tx, id, user.id);
        const { quiz } = await writable(tx, courseId, id, user);
        if (JSON.stringify(quiz.questions) !== JSON.stringify(prepared.quiz.questions)) throw new HttpError(409, 'Quiz questions changed; reload before submitting');
        const current = await database.latest(tx, courseId, id, user.id);
        if (prepared.current && (!current || current.id !== prepared.current.id || current.status !== 'draft' || current.updatedAt.getTime() !== prepared.current.updatedAt.getTime())) throw new HttpError(409, 'Draft changed; reload before submitting');
        if (!prepared.current && current?.status === 'draft') throw new HttpError(409, 'A draft was created; reload before submitting');
        const item = await draft(tx, courseId, id, user, quiz, prepared.answers);
        if (item.attemptNumber > quiz.maxAttempts) throw new HttpError(409, 'Quiz attempt limit reached');
        const marks = automaticMarks(quiz.questions, prepared.answers);
        return submissionResponse(await database.finalize(tx, item.id, prepared.answers, key, marks, total(quiz.questions, marks)), quiz.showResults);
      });
    } catch (error) {
      try { await deleteObject(key); } catch (cleanupError) { console.error('Quiz answer cleanup failed:', cleanupError); }
      throw error;
    }
  },

  // List each student's latest finalized attempt for course managers.
  submissions(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      await access(tx, courseId, id, user, true);
      return (await database.submissions(tx, courseId, id)).map((item) => submissionResponse(item, true));
    });
  },

  // List all attempts belonging to the current student with unreleased marks hidden.
  own(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      const { quiz, manage } = await access(tx, courseId, id, user);
      return (await database.own(tx, courseId, id, user.id)).map((item) => submissionResponse(item, manage || quiz.showResults));
    });
  },

  // Summarize latest finalized attempts for currently enrolled active students.
  statistics(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      await access(tx, courseId, id, user, true);
      const [students, attempts] = await Promise.all([database.eligibleStudents(tx, courseId), database.submissions(tx, courseId, id)]);
      const eligible = new Set(students.map((student) => student.userId));
      const submitted = attempts.filter((attempt) => eligible.has(attempt.studentId));
      return { quizId: id, eligibleStudents: eligible.size, submittedCount: submitted.length,
        gradedCount: submitted.filter((attempt) => attempt.status === 'graded').length,
        submissionRate: eligible.size ? submitted.length / eligible.size : 0 };
    });
  },

  // Return a single attempt only to its owner or a manager reviewing finalized work.
  async submission(courseId: number, id: number, submissionId: number, user: CurrentUser, result = false) {
    const snapshot = await courseDb.read(async (tx) => {
      const { quiz, manage } = await access(tx, courseId, id, user);
      const item = await database.submission(tx, courseId, id, submissionId);
      if (!item) throw new HttpError(404, 'Submission not found');
      if (item.studentId !== user.id && (!manage || item.status === 'draft')) throw new HttpError(403, 'Forbidden');
      if (result && (item.status === 'draft' || (!manage && !quiz.showResults))) throw new HttpError(403, 'Forbidden');
      return { response: submissionResponse(item, manage || quiz.showResults), key: item.s3Key };
    });
    if (result) {
      if (!snapshot.key) throw new Error('Finalized submission has no answer file');
      const archived = await getQuizAnswers(snapshot.key);
      try { snapshot.response.answers = quizAnswersBody({ answers: archived }); }
      catch { throw new Error('Quiz answer file is invalid'); }
    }
    return snapshot.response;
  },

  // Merge instructor marks with automatic grades and complete grading when every question has a mark.
  grade(courseId: number, id: number, submissionId: number, user: CurrentUser, data: QuizGradeData) {
    return database.write(async (tx) => {
      const { quiz } = await access(tx, courseId, id, user, true, true);
      const item = await database.submission(tx, courseId, id, submissionId);
      if (!item) throw new HttpError(404, 'Submission not found');
      await database.lockStudent(tx, id, item.studentId);
      const current = (await database.submission(tx, courseId, id, submissionId))!;
      if (current.status === 'draft') throw new HttpError(409, 'Submit the attempt before grading');
      const marks = { ...current.questionMarks as QuizQuestionMarks };
      for (const grade of data.grades) {
        const question = quiz.questions.find((question) => question.id === grade.questionId);
        if (!question || grade.mark > Number(question.points)) throw new HttpError(400, 'Question mark must reference this quiz and not exceed its points');
        marks[String(question.id)] = { mark: grade.mark, source: 'manual' };
      }
      return submissionResponse(await database.grade(tx, current.id, marks, total(quiz.questions, marks), user.id, data.feedback), true);
    });
  },
};
