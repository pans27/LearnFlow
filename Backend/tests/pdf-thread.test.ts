import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { parsePdfInThread, processPdf } from '../src/workers/pdf-processor';
import { getPdf } from '../src/storage/s3';
import { config } from '../src/config';
import { PDF_PARSER_READY } from '../src/workers/pdf-parser';

const workerUrl = new URL('./fixtures/pdf-parser.mjs', import.meta.url);

test('PDF parsing runs on another thread without detaching caller bytes', async () => {
  const bytes = Buffer.from('document');
  const pages = await parsePdfInThread(bytes, { workerUrl });
  assert.match(pages[0].text, /^false:[1-9]\d*:document$/);
  assert.equal(bytes.toString(), 'document');
});

test('parser crashes, missing results, and timeouts reject without leaving threads running', async () => {
  await assert.rejects(parsePdfInThread(Buffer.from('crash'), { workerUrl }), /Test parser failed/);
  await assert.rejects(parsePdfInThread(Buffer.from('exit'), { workerUrl }), /exited without a result/);
  await assert.rejects(parsePdfInThread(Buffer.from('hang'), { workerUrl, timeoutMs: 100 }), /timed out/);
});

test('native Node 24 TypeScript thread loads the parser TODO while queue consumption remains disabled', async () => {
  assert.equal(PDF_PARSER_READY, false);
  await assert.rejects(parsePdfInThread(Buffer.from('%PDF-1.4')), /PDF parser has not been implemented/);
});

test('private S3 reads validate PDF size and feed the thread processor without real AWS access', async (t) => {
  Object.assign(config.s3, { region: 'us-east-1', bucket: 'test-bucket', accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
  let chunks = [Buffer.from('%PDF-1.4')];
  const send = t.mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    assert.ok(command instanceof GetObjectCommand);
    assert.equal(command.input.Bucket, 'test-bucket');
    assert.equal(command.input.Key, 'private.pdf');
    return { Body: Readable.from(chunks) };
  });
  assert.equal(Buffer.from(await getPdf('private.pdf')).toString(), '%PDF-1.4');
  await assert.rejects(processPdf({ id: 1, courseId: 1, resourceId: 1, attempts: 1, s3Key: 'private.pdf' }), /PDF parser has not been implemented/);
  chunks = [];
  await assert.rejects(getPdf('private.pdf'), /empty/);
  chunks = [Buffer.alloc(10 * 1024 * 1024 + 1)];
  await assert.rejects(getPdf('private.pdf'), /exceeds/);
  assert.equal(send.mock.callCount(), 4);
});
