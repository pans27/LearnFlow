import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssignmentBody, updateAssignmentBody, assignmentGradeBody } from '../src/validation/assignments';
import { HttpError } from '../src/errors';

test('assignment settings require strict fields, booleans, and timezone-aware deadlines', () => {
  assert.deepEqual(createAssignmentBody({ title: ' Homework ' }), { title: 'Homework', isVisible: false, allowResubmission: false, gradesVisible: false, maxMark: 100 });
  assert.deepEqual(updateAssignmentBody({ description: null, dueAt: null, allowResubmission: true }),
    { description: null, dueAt: null, allowResubmission: true });
  assert.equal(updateAssignmentBody({ dueAt: '2026-12-01T12:00:00Z' }).dueAt?.toISOString(), '2026-12-01T12:00:00.000Z');
  for (const body of [null, [], {}, { title: '' }, { title: 'x'.repeat(201) }, { studentId: 5 },
    { dueAt: 'tomorrow' }, { dueAt: '2026-12-01' }, { allowResubmission: 'true' }, { isVisible: 1 }]) {
    assert.throws(() => updateAssignmentBody(body), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.throws(() => createAssignmentBody({ isVisible: true }), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test('assignment maximums accept positive fractional points without capping bonus marks', () => {
  assert.equal(createAssignmentBody({ title: 'Quiz', maxMark: 12.5 }).maxMark, 12.5);
  assert.deepEqual(updateAssignmentBody({ maxMark: 20 }), { maxMark: 20 });
  assert.deepEqual(assignmentGradeBody({ mark: 25 }), { mark: 25 });
  for (const maxMark of [0, -1, null, '100', Infinity, NaN]) {
    assert.throws(() => updateAssignmentBody({ maxMark }), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
});

test('assignment marks accept fractional points or clearing and reject invalid values', () => {
  assert.deepEqual(assignmentGradeBody({ mark: 87.5 }), { mark: 87.5 });
  assert.deepEqual(assignmentGradeBody({ mark: 0 }), { mark: 0 });
  assert.deepEqual(assignmentGradeBody({ mark: null }), { mark: null });
  for (const body of [{}, { mark: -1 }, { mark: '80' }, { mark: Infinity }, { mark: NaN }, { mark: 1, studentId: 2 }]) {
    assert.throws(() => assignmentGradeBody(body), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.throws(() => updateAssignmentBody({ gradesVisible: 'true' }), (error: unknown) => error instanceof HttpError && error.status === 400);
});
