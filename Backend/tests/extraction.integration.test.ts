import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';

test('extraction job lifecycle and concurrent workers', { skip: !process.env.TEST_DATABASE_URL, timeout: 120000 }, async (t) => {
  const name = `learnflow_extraction_${process.pid}_${Date.now()}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  const management = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let created = false;
  let cleanup = async () => {};
  t.after(async () => {
    await cleanup();
    if (created) await management.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await management.end();
  });
  await management.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'learnflow');
  process.env.DATABASE_URL = url.toString();
  const migrated = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: process.env, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(migrated.status, 0, `${migrated.stdout}\n${migrated.stderr}`);
  const { getPrisma, closeDatabase } = await import('../src/database');
  cleanup = closeDatabase;
  const prisma = getPrisma();
  const { extractionDb } = await import('../src/db/extraction');
  const { processNextExtraction } = await import('../src/workers/extraction');
  const owner = await prisma.user.create({ data: { email: 'worker@example.test', name: 'Owner', passwordHash: 'test-only' } });
  const course = await prisma.course.create({ data: { name: 'Extraction', courseCode: 'E' } });
  // Create a resource and its extraction job for each independent scenario.
  const enqueue = async (label: string, maxAttempts = 3) => {
    const resource = await prisma.learningResource.create({ data: { courseId: course.id, ownerId: owner.id,
      resourceType: 'student_note', title: label, originalFilename: 'notes.pdf', s3Key: `test/${label}.pdf` } });
    const job = await prisma.extractionJob.create({ data: { courseId: course.id, resourceId: resource.id, maxAttempts } });
    return { resource, job };
  };
  await t.test('an empty queue does not invoke the processor', async () => {
    assert.equal(await processNextExtraction(async () => { throw new Error('Should not run'); }), 'idle');
  });
  await t.test('concurrent workers claim distinct jobs and publish pages atomically', async () => {
    const first = await enqueue('first');
    const second = await enqueue('second');
    const claimed = await Promise.all([extractionDb.claim(), extractionDb.claim()]);
    assert.ok(claimed[0] && claimed[1]);
    assert.notEqual(claimed[0].id, claimed[1].id);
    assert.equal(await extractionDb.claim(), null);
    for (const work of claimed) {
      assert.ok(work);
      assert.equal(work.attempts, 1);
      const resource = await prisma.learningResource.findUniqueOrThrow({ where: { id: work.resourceId } });
      assert.equal(resource.extractionStatus, 'processing');
      assert.equal(work.s3Key, resource.s3Key);
      assert.equal(await extractionDb.complete(work, [{ pageNumber: 1, text: 'PostgreSQL searchable text' }]), true);
      assert.equal(await extractionDb.complete(work, [{ pageNumber: 1, text: 'Stale overwrite' }]), false);
      const page = await prisma.resourcePage.findFirstOrThrow({ where: { resourceId: work.resourceId } });
      assert.equal(page.extractedText, 'PostgreSQL searchable text');
      const done = await prisma.learningResource.findUniqueOrThrow({ where: { id: work.resourceId } });
      assert.equal(done.extractionStatus, 'completed');
      assert.equal(done.pageCount, 1);
    }
    assert.equal(await prisma.extractionJob.count({ where: { id: { in: [first.job.id, second.job.id] }, status: 'completed' } }), 2);
    const searchable = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM learnflow.resource_pages WHERE search_vector @@ plainto_tsquery('english', 'PostgreSQL')
    `;
    assert.equal(Number(searchable[0].count), 2);
  });
  await t.test('processing failures retry only up to maxAttempts and reject stale outcomes', async (t) => {
    t.mock.method(console, 'error', () => {});
    const { job, resource } = await enqueue('retry', 2);
    const first = await extractionDb.claim();
    assert.ok(first);
    assert.equal(await extractionDb.fail(first, 'Temporary failure'), true);
    let row = await prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.lastError, 'Temporary failure');
    assert.equal(row.status, 'failed');
    assert.equal(await processNextExtraction(async (work) => {
      assert.equal(work.attempts, 2);
      assert.equal(await extractionDb.complete(first, []), false);
      throw new Error('Unreadable PDF');
    }), 'failed');
    row = await prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(row.attempts, 2);
    assert.equal(row.lastError, 'Unreadable PDF');
    assert.ok(row.finishedAt);
    assert.equal((await prisma.learningResource.findUniqueOrThrow({ where: { id: resource.id } })).extractionStatus, 'failed');
    assert.equal(await extractionDb.claim(), null);
  });
  await t.test('processor output is validated and deleted resources discard in-flight results', async (t) => {
    t.mock.method(console, 'error', () => {});
    const invalid = await enqueue('invalid', 1);
    assert.equal(await processNextExtraction(async () => [{ pageNumber: 2, text: 'Missing first page' }]), 'failed');
    assert.equal(await prisma.resourcePage.count({ where: { resourceId: invalid.resource.id } }), 0);
    const deleted = await enqueue('deleted');
    assert.equal(await processNextExtraction(async () => {
      await prisma.learningResource.delete({ where: { id: deleted.resource.id } });
      return [{ pageNumber: 1, text: 'Too late' }];
    }), 'discarded');
    assert.equal(await prisma.extractionJob.count({ where: { id: deleted.job.id } }), 0);
  });
  await t.test('successful processors persist all pages and finish the job', async () => {
    const { resource, job } = await enqueue('success');
    assert.equal(await processNextExtraction(async (work) => {
      assert.equal(work.s3Key, resource.s3Key);
      return [{ pageNumber: 1, text: 'First page' }, { pageNumber: 2, text: '' }];
    }), 'completed');
    assert.equal((await prisma.learningResource.findUniqueOrThrow({ where: { id: resource.id } })).pageCount, 2);
    assert.equal((await prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'completed');
  });
});
