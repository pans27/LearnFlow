import type { RequestHandler, Response } from 'express';
import type { CurrentUser, SessionRequest, ValidatedLocals } from '../types';
import { userDb } from '../db/users';
import { HttpError } from '../errors';
import { handleRequest } from './handler';

// Load the account identified by the current user stored in the session.
export const requireCurrentUser: RequestHandler = handleRequest(async (req, res, next) => {
  // TODO(auth owner): mount cookie/session middleware and set session.currentUser after login.
  const session = (req as SessionRequest).session;
  const userId = session?.currentUser?.id;
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId < 1 || userId > 2147483647) {
    throw new HttpError(401, 'Unauthorized');
  }
  const user = await userDb.findSessionAccount(userId);
  if (!user?.isActive) throw new HttpError(401, 'Unauthorized');
  if (user.mustChangePassword) throw new HttpError(403, 'Forbidden');
  const locals = res.locals as ValidatedLocals;
  locals.currentUser = { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin };
  next();
});

// Return the account loaded by the current-user middleware.
export function requireUser(res: Response): CurrentUser {
  const { currentUser } = res.locals as ValidatedLocals;
  if (!currentUser) throw new Error('Missing current-user middleware');
  return currentUser;
}
