import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/errors';
import { createQuizBody, updateQuizBody, quizQuestionBody, quizAnswersBody, quizGradeBody } from '../src/validation/quizzes';

test('quiz settings require strict booleans, positive attempt limits, and timezone-aware dates', () => {
  assert.deepEqual(createQuizBody({ title: ' Quiz ' }), { title: 'Quiz', isVisible: false, status: 'draft', maxAttempts: 1, showResults: false });
  for (const value of [{ maxAttempts: 0 }, { maxAttempts: '2' }, { maxAttempts: 1.5 }, { showResults: 'true' }, { status: 'unknown' }, { dueAt: 'tomorrow' }, { dueAt: '2026-12-01' }, { createdBy: 2 }]) {
    assert.throws(() => updateQuizBody(value), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
});

test('question keys and selection modes must match valid unique options', () => {
  assert.equal(quizQuestionBody({ type: 'short_answer', prompt: 'Explain' }).answerKey, null);
  assert.deepEqual(quizQuestionBody({ type: 'multiple_choice', prompt: 'Select', options: ['A', 'B'], answerKey: ['A'] }).answerKey, ['A']);
  for (const value of [
    { type: 'short_answer', prompt: 'Explain', allowMultiple: true },
    { type: 'multiple_choice', prompt: 'Select', options: ['A', 'A'] },
    { type: 'multiple_choice', prompt: 'Select', options: ['A', 'B'], answerKey: ['A', 'B'] },
    { type: 'multiple_choice', prompt: 'Select', options: ['A', 'B'], answerKey: ['C'] },
    { type: 'short_answer', prompt: 'Explain', points: -1 },
    { type: 'short_answer', prompt: 'Explain', points: 1.234 },
  ]) assert.throws(() => quizQuestionBody(value), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test('answers and manual grades reject unknown body fields and invalid mappings', () => {
  assert.deepEqual(quizAnswersBody({ answers: { '1': 'Text', '2': ['A'] } }), { '1': 'Text', '2': ['A'] });
  for (const value of [{ answers: [] }, { answers: { '01': 'Text' } }, { answers: { '1': true } }, { answers: {}, score: 100 }]) {
    assert.throws(() => quizAnswersBody(value), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.deepEqual(quizGradeBody({ grades: [{ questionId: 1, mark: 0 }] }), { grades: [{ questionId: 1, mark: 0 }] });
  for (const value of [{ grades: [] }, { grades: [{ questionId: 1, mark: -1 }] }, { grades: [{ questionId: 1, mark: 1 }, { questionId: 1, mark: 2 }] }]) {
    assert.throws(() => quizGradeBody(value), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
});
