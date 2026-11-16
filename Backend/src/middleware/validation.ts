import type { RequestHandler } from 'express';
import { id } from '../validation/admin';
import { handleRequest } from './handler';

// Validate the request body and store the parsed input in response locals.
export function validateBody(parser: (value: unknown) => unknown): RequestHandler {
  return handleRequest((req, res, next) => {
    res.locals.input = parser(req.body);
    next();
  });
}

// Parse route IDs and store them in response locals.
export const validateIds: RequestHandler = handleRequest((req, res, next) => {
  for (const key of ['courseId', 'userId']) {
    if (req.params[key] !== undefined) res.locals[key] = id(req.params[key]);
  }
  next();
});
