import type { RequestHandler, Response } from 'express';
import type { ValidatedLocals, ValidatedBodyField } from '../types';
import { id } from '../validation/admin';
import { handleRequest } from './handler';

// Validate the request body and store it under its named response-local field.
export function validateBody(parser: (value: unknown) => unknown, field: ValidatedBodyField): RequestHandler {
  return handleRequest((req, res, next) => {
    res.locals[field] = parser(req.body);
    next();
  });
}

// Parse route IDs and store them in response locals.
export const validateIds: RequestHandler = handleRequest((req, res, next) => {
  const locals = res.locals as ValidatedLocals;
  for (const key of ['courseId', 'userId', 'announcementId', 'resourceId', 'assignmentId', 'submissionId', 'quizId', 'questionId'] as const) {
    if (req.params[key] !== undefined) locals[key] = id(req.params[key]);
  }
  next();
});

// Return a validated route ID or report missing validation middleware.
export function requireId(res: Response, field: 'courseId' | 'userId' | 'announcementId' | 'resourceId' | 'assignmentId' | 'submissionId' | 'quizId' | 'questionId'): number {
  const value = (res.locals as ValidatedLocals)[field];
  if (value === undefined) throw new Error(`Missing validated ${field}`);
  return value;
}
