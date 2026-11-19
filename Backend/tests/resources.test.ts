import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError } from '../src/errors';
import { assertPdf, resourceFields } from '../src/validation/resources';

const invalid = (fn: () => unknown, message?: string) => assert.throws(fn, (error: unknown) =>
  error instanceof HttpError && error.status === 400 && (message === undefined || error.message === message));

test('resource uploads accept a PDF and reject other files', () => {
  const pdf = Buffer.from('%PDF-1.4\n');
  assert.doesNotThrow(() => assertPdf('notes.pdf', 'application/pdf', pdf));
  invalid(() => assertPdf('notes.txt', 'text/plain', Buffer.from('hello')), 'Choose a PDF file');
  invalid(() => assertPdf('notes.pdf', 'application/pdf', Buffer.from('hello')), 'Choose a PDF file');
  invalid(() => assertPdf('notes.pdf', 'application/pdf', Buffer.alloc(0)), 'Choose a nonempty PDF up to 10 MB');
});

test('resource fields accept course PDFs and private student notes', () => {
  assert.deepEqual(resourceFields({ title: ' Week 1 ', resourceType: 'student_note', visibility: 'hidden' }),
    { title: 'Week 1', resourceType: 'student_note', isVisible: false });
  assert.equal(resourceFields({ title: 'Lecture', resourceType: 'instructor_material' }).isVisible, true);
  invalid(() => resourceFields({ title: 'Lecture', resourceType: 'assignment_file' }), 'Invalid resource type');
  invalid(() => resourceFields({ title: ' ', resourceType: 'student_note' }), 'title must be nonempty text of at most 200 characters');
});
