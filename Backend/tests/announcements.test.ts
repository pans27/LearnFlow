import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnnouncementBody, updateAnnouncementBody, announcementQuery } from '../src/validation/announcements';
import { DEFAULT_ANNOUNCEMENT_PAGE_SIZE } from '../src/constants/announcements';
import { HttpError } from '../src/errors';

// Require invalid announcement input to produce an expected HTTP 400 failure.
const invalid = (operation: () => unknown) => assert.throws(operation,
  (error: unknown) => error instanceof HttpError && error.status === 400);

test('announcement bodies validate text, visibility, and immutable fields', () => {
  assert.deepEqual(createAnnouncementBody({ title: ' Update ', body: ' First\nSecond ' }),
    { title: 'Update', body: 'First\nSecond', isVisible: true });
  assert.deepEqual(updateAnnouncementBody({ isVisible: false }), { isVisible: false });
  for (const value of [undefined, null, [], {}, { title: 'Only title' }, { title: ' ', body: 'Text' },
    { title: 'x'.repeat(201), body: 'Text' }, { title: 'x', body: 'x'.repeat(20001) },
    { title: 'x', body: 'Text', authorId: 1 }, { title: 'x', body: 'Text', isVisible: 'false' }]) {
    invalid(() => createAnnouncementBody(value));
  }
  invalid(() => updateAnnouncementBody({}));
  invalid(() => updateAnnouncementBody({ courseId: 2 }));
  invalid(() => updateAnnouncementBody({ title: null }));
});

test('announcement pagination rejects malformed and oversized requests', () => {
  assert.deepEqual(announcementQuery({}), { limit: DEFAULT_ANNOUNCEMENT_PAGE_SIZE });
  assert.deepEqual(announcementQuery({ limit: '100', cursor: '42' }), { limit: 100, cursor: 42 });
  for (const value of [{ limit: '0' }, { limit: '101' }, { limit: '1.5' }, { cursor: 'bad' },
    { cursor: ['1', '2'] }, { limit: ['1'] }, { cursor: '2147483648' }, { isVisible: 'false' }]) {
    invalid(() => announcementQuery(value));
  }
});
