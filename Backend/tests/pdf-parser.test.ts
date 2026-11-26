import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePdf } from '../src/workers/pdf-parser';
import { samplePdf } from './pdf-samples';

test('parsePdf returns consecutive page text and keeps blank pages', async () => {
  const pages = await parsePdf(samplePdf([
    ['LearnFlow extraction', 'PostgreSQL searchable text'],
    [],
  ]));
  assert.deepEqual(pages, [
    { pageNumber: 1, text: 'LearnFlow extraction\nPostgreSQL searchable text' },
    { pageNumber: 2, text: '' },
  ]);
});

test('parsePdf rejects an empty file, a file over 10 MB, and more than 500 pages', async () => {
  await assert.rejects(parsePdf(new Uint8Array()), /PDF is empty/);
  await assert.rejects(parsePdf(new Uint8Array(10 * 1024 * 1024 + 1)), /PDF exceeds 10 MB/);
  await assert.rejects(parsePdf(samplePdf(Array.from({ length: 501 }, () => []))), /PDF exceeds 500 pages/);
});

test('parsePdf reports a document that is not a PDF', async () => {
  await assert.rejects(parsePdf(Buffer.from('%PDF-1.4')), /Invalid PDF structure/);
});
