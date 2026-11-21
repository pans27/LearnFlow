import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractionDb } from '../src/db/extraction';
import { runExtractionWorker } from '../src/workers/runner';

test('runner shutdown interrupts an idle wait without consuming jobs', async (t) => {
  const controller = new AbortController();
  const claim = t.mock.method(extractionDb, 'claim', async () => {
    setImmediate(() => controller.abort());
    return null;
  });
  await runExtractionWorker(async () => { throw new Error('No job should be processed'); },
    { signal: controller.signal, pollIntervalMs: 60000 });
  assert.equal(claim.mock.callCount(), 1);
});

test('runner retries infrastructure failures and waits for in-flight processing during shutdown', async (t) => {
  const controller = new AbortController();
  t.mock.method(console, 'error', () => {});
  let attempts = 0;
  t.mock.method(extractionDb, 'claim', async () => {
    if (++attempts === 1) throw new Error('Database temporarily unavailable');
    return { id: 1, courseId: 1, resourceId: 1, attempts: 1, s3Key: 'test.pdf' };
  });
  const complete = t.mock.method(extractionDb, 'complete', async () => true);
  await runExtractionWorker(async () => {
    controller.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    return [{ pageNumber: 1, text: 'Finished despite shutdown' }];
  }, { signal: controller.signal, retryDelayMs: 1 });
  assert.equal(attempts, 2);
  assert.equal(complete.mock.callCount(), 1);
});
