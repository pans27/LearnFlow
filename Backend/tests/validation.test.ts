import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseBody, enrollmentBody, id, statusBody, userBody } from '../src/validation/admin';
import { bulkEnrollmentBody, bulkRemovalBody } from '../src/validation/admin';
import { HttpError } from '../src/errors';

// Assert that an operation raises an HTTP 400 validation error.
const invalid = (fn: () => unknown, message?: string) => assert.throws(fn, (error: unknown) =>
  error instanceof HttpError && error.status === 400 && (message === undefined || error.message === message));

test('IDs accept positive int32 values and reject malformed or out-of-range input', () => {
  assert.equal(id('2147483647'), 2147483647);
  assert.equal(id(1), 1);
  for (const value of ['2147483648', '0', '-1', '1.0', '1e2', '01', ' 1', ['1'],
    0, -1, 1.5, NaN, Infinity, 2147483648, undefined]) {
    invalid(() => id(value), 'Invalid ID');
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
  assert.deepEqual(enrollmentBody({ userId: 10, role: 'instructor' }, true), { userId: 10, role: 'instructor' });
  assert.equal(statusBody({ status: 'archived' }), 'archived');
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ userId: '10', role: 'student' }, true), 'Invalid ID');
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ role: 'admin' }));
  // Assert that an operation raises an HTTP 400 validation error.
  invalid(() => enrollmentBody({ role: 'student', courseId: 2 }));
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

test('bulk membership bodies require bounded batches of unique valid user IDs', () => {
  assert.deepEqual(bulkEnrollmentBody({ enrollments: [
    { userId: 1, role: 'student' }, { userId: 2, role: 'instructor' },
  ] }), { enrollments: [{ userId: 1, role: 'student' }, { userId: 2, role: 'instructor' }] });
  assert.deepEqual(bulkRemovalBody({ userIds: [1, 2] }), { userIds: [1, 2] });
  for (const entries of [[], null, '1', Array(101).fill('1')]) {
    invalid(() => bulkRemovalBody({ userIds: entries }));
    invalid(() => bulkEnrollmentBody({ enrollments: entries }));
  }
  invalid(() => bulkEnrollmentBody({ enrollments: [{ userId: 1, role: 'admin' }] }));
  invalid(() => bulkEnrollmentBody({ enrollments: [{ userId: 1, role: 'student', isAdmin: true }] }));
  invalid(() => bulkEnrollmentBody({ enrollments: [
    { userId: 1, role: 'student' }, { userId: 1, role: 'instructor' },
  ] }), 'Duplicate user IDs in batch');
  invalid(() => bulkRemovalBody({ userIds: [1, 1] }), 'Duplicate user IDs in batch');
  invalid(() => bulkRemovalBody({ userIds: [1, 'invalid'] }), 'Invalid ID');
  invalid(() => bulkRemovalBody({ userIds: ['1'] }), 'Invalid ID');
  invalid(() => bulkRemovalBody({ userIds: [2147483648] }), 'Invalid ID');
  invalid(() => bulkRemovalBody({ userIds: [1], courseId: 2 }));
});
