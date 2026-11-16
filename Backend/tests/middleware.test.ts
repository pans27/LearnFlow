import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { errorHandler } from '../src/middleware';
import { handleRequest } from '../src/middleware/handler';
import { HttpError } from '../src/errors';

test('every error reaching errorHandler is logged and returns 500', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const response = {
    headersSent: false,
    status: t.mock.fn((_status: number): Response => response as unknown as Response),
    json: t.mock.fn((_body: unknown) => {}),
  };
  const next = t.mock.fn();
  const errors = [new Error('Unexpected failure'), new HttpError(404, 'Not found'), { code: 'P2025', status: 400 }];
  for (const error of errors) {
    errorHandler(error, {} as Request, response as unknown as Response, next);
    assert.equal(log.mock.calls.at(-1)?.arguments[0], error);
    assert.equal(response.status.mock.calls.at(-1)?.arguments[0], 500);
    assert.deepEqual(response.json.mock.calls.at(-1)?.arguments[0], { message: 'An unexpected error occurred' });
  }
  assert.equal(next.mock.callCount(), 0);
  response.headersSent = true;
  errorHandler(errors[0], {} as Request, response as unknown as Response, next);
  assert.equal(log.mock.callCount(), 4);
  assert.equal(response.status.mock.callCount(), 3);
  assert.equal(next.mock.calls[0].arguments[0], errors[0]);
});

test('request handlers respond to expected failures and forward unexpected failures', async (t) => {
  const response = {
    headersSent: false,
    status: t.mock.fn((_status: number): Response => response as unknown as Response),
    json: t.mock.fn((_body: unknown) => {}),
  };
  const next = t.mock.fn();
  await handleRequest(() => { throw new HttpError(409, 'Already enrolled'); })(
    {} as Request, response as unknown as Response, next,
  );
  assert.equal(response.status.mock.calls[0].arguments[0], 409);
  assert.deepEqual(response.json.mock.calls[0].arguments[0], { message: 'Already enrolled' });
  assert.equal(next.mock.callCount(), 0);
  const unexpected = new Error('Database connection failed');
  await handleRequest(() => { throw unexpected; })({} as Request, response as unknown as Response, next);
  assert.equal(next.mock.calls[0].arguments[0], unexpected);
});
