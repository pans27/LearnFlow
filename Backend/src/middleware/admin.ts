import type { RequestHandler } from 'express';
import { requireUser } from './current-user';
import { handleRequest } from './handler';
import { HttpError } from '../errors';

// Require administrator permission on the account loaded from the verified session.
export const requireAdmin: RequestHandler = handleRequest((_req, res, next) => {
  if (!requireUser(res).isAdmin) throw new HttpError(403, 'Forbidden');
  next();
});
