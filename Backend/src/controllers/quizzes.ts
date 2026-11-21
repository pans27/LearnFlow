import type { RequestHandler } from 'express';
import type { ValidatedLocals } from '../types';
import { handleRequest } from '../middleware/handler';
import { requireId } from '../middleware/validation';
import { requireUser } from '../middleware/current-user';
import { quizService as service } from '../services/quizzes';

// List quizzes visible to the authenticated course member.
export const list: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.list(requireId(res, 'courseId'), requireUser(res)));
});

// Return quiz metadata and role-filtered questions.
export const get: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.get(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res)));
});

// Create a quiz with validated instructor settings.
export const create: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizData;
  if (!data) throw new Error('Missing validated quiz data');
  res.status(201).json(await service.create(requireId(res, 'courseId'), requireUser(res), data));
});

// Update quiz availability, publication, attempts, or result release.
export const update: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizUpdate;
  if (!data) throw new Error('Missing validated quiz update');
  res.json(await service.update(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res), data));
});

// Delete a quiz without attempt history.
export const remove: RequestHandler = handleRequest(async (_req, res) => {
  await service.remove(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res));
  res.status(204).end();
});

// Return the quiz's ordered role-filtered questions.
export const questions: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.get(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res))).questions);
});

// Add a validated question before any attempt has started.
export const createQuestion: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizQuestion;
  if (!data) throw new Error('Missing validated quiz question');
  res.status(201).json(await service.saveQuestion(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res), data));
});

// Replace all editable fields of a question before attempts begin.
export const updateQuestion: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizQuestion;
  if (!data) throw new Error('Missing validated quiz question');
  res.json(await service.saveQuestion(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res), data, requireId(res, 'questionId')));
});

// Delete a question before attempts begin.
export const removeQuestion: RequestHandler = handleRequest(async (_req, res) => {
  await service.removeQuestion(requireId(res, 'courseId'), requireId(res, 'quizId'), requireId(res, 'questionId'), requireUser(res));
  res.status(204).end();
});

// Return the student's saved draft or null when no draft exists.
export const getDraft: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.getDraft(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res)));
});

// Save validated answers to the current student's draft attempt.
export const saveDraft: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizAnswers;
  if (!data) throw new Error('Missing validated quiz answers');
  res.json(await service.saveDraft(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res), data,
    (res.locals as ValidatedLocals).submissionId));
});

// Finalize supplied answers as the student's current or next permitted attempt.
export const submit: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizAnswers;
  if (!data) throw new Error('Missing validated quiz answers');
  res.status(201).json(await service.submit(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res), data,
    (res.locals as ValidatedLocals).submissionId));
});

// Return all attempts belonging to the current account with unreleased marks hidden.
export const own: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.own(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res)));
});

// Return each student's latest finalized attempt to course managers.
export const submissions: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.submissions(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res)));
});

// Return an authorized attempt without exposing private storage references.
export const submission: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.submission(requireId(res, 'courseId'), requireId(res, 'quizId'), requireId(res, 'submissionId'), requireUser(res)));
});

// Return released results to owners or finalized results to course managers.
export const result: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.submission(requireId(res, 'courseId'), requireId(res, 'quizId'), requireId(res, 'submissionId'), requireUser(res), true));
});

// Save validated manual question marks and feedback for a finalized attempt.
export const grade: RequestHandler = handleRequest(async (_req, res) => {
  const data = (res.locals as ValidatedLocals).quizGrade;
  if (!data) throw new Error('Missing validated quiz grade');
  res.json(await service.grade(requireId(res, 'courseId'), requireId(res, 'quizId'), requireId(res, 'submissionId'), requireUser(res), data));
});

// Return active-student submission and grading statistics for course managers.
export const statistics: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.statistics(requireId(res, 'courseId'), requireId(res, 'quizId'), requireUser(res)));
});
