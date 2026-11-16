import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseBody, enrollmentBody, id, statusBody, userBody } from '../src/validation/admin';
import { HttpError } from '../src/errors';

// Assert that an operation raises an HTTP 400 validation error.
const invalid = (fn: () => unknown) => assert.throws(fn, (error: unknown) =>
  error instanceof HttpError && error.status === 400);

test('IDs preserve bigint precision and reject out-of-range/malformed input', () => {
  assert.equal(id('9223372036854775807'), 9223372036854775807n);
  for (const value of ['9223372036854775808', '0', '-1', '1.0', '1e2', '01', ' 1', ['1'], 1, undefined]) {
    // Assert that an operation raises an HTTP 400 validation error.
    invalid(() => id(value));
  }
});

test('course input rejects mass assignment and accepts explicit null descriptions', () => {
  assert.deepEqual(courseBody({ name: '  ECE1724  ', description: null }), { name: 'ECE1724', description: null });
  assert.deepEqual(courseBody({ description: '' }, true), { description: '' });
  for (const body of [undefined, null, [], {}, { name: ' ' }, { name: 1 }, { name: 'x', status: 'archived' }, { courseCode: 'x' }]) {
    // Assert that an operation raises an HTTP 400 validation error.
    invalid(() => courseBody(body));
  }
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => courseBody({}, true));
});

test('role and status input cannot smuggle unrelated fields', () => {
  assert.deepEqual(enrollmentBody({ userId: '10', role: 'instructor' }, true), { userId: 10n, role: 'instructor' });
  assert.equal(statusBody({ status: 'archived' }), 'archived');
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ userId: 10, role: 'student' }, true));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ role: 'admin' }));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ role: 'student', courseId: '2' }));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => statusBody({ status: 'deleted' }));
});

test('admin user updates cannot change passwords or coerce booleans', () => {
  assert.deepEqual(userBody({ isAdmin: false }), { isAdmin: false });
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => userBody({ isAdmin: 'false' }));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => userBody({ passwordHash: 'anything' }));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => userBody({}));
});
