import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAssignmentBody, updateAssignmentBody } from '../src/validation/assignments';
import { HttpError } from '../src/errors';

test('assignment settings require strict fields, booleans, and timezone-aware deadlines', () => {
  assert.deepEqual(createAssignmentBody({ title: ' Homework ' }), { title: 'Homework', isVisible: false, allowResubmission: false });
  assert.deepEqual(updateAssignmentBody({ description: null, dueAt: null, allowResubmission: true }),
    { description: null, dueAt: null, allowResubmission: true });
  assert.equal(updateAssignmentBody({ dueAt: '2026-12-01T12:00:00Z' }).dueAt?.toISOString(), '2026-12-01T12:00:00.000Z');
  for (const body of [null, [], {}, { title: '' }, { title: 'x'.repeat(201) }, { studentId: 5 },
    { dueAt: 'tomorrow' }, { dueAt: '2026-12-01' }, { allowResubmission: 'true' }, { isVisible: 1 }]) {
    assert.throws(() => updateAssignmentBody(body), (error: unknown) => error instanceof HttpError && error.status === 400);
  }
  assert.throws(() => createAssignmentBody({ isVisible: true }), (error: unknown) => error instanceof HttpError && error.status === 400);
});
