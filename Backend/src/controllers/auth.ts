import type { RequestHandler } from 'express';
import { clearAuthCookie, setAuthCookie } from '../auth/cookies';
import { handleRequest } from '../middleware/handler';
import { authService } from '../services/auth';
import { HttpError } from '../errors';
import type { SessionRequest } from '../types';
import { changePasswordBody, loginBody } from '../validation/auth';

// Read the session attached by the JWT cookie middleware.
function sessionUser(req: SessionRequest): { id: number; sessionId?: string } {
  const id = req.session?.currentUser?.id;
  if (typeof id !== 'number') throw new HttpError(401, 'Unauthorized');
  return { id, sessionId: req.session?.sessionId };
}

// Check the email and password, then set the JWT session cookie.
export const login: RequestHandler = handleRequest(async (req, res) => {
  const input = loginBody(req.body);
  const result = await authService.login(input.email, input.password);
  setAuthCookie(res, result.token, result.expiresAt);
  res.json(result.user);
});

// Return the signed-in account. A required password change does not block this read.
export const me: RequestHandler = handleRequest(async (req, res) => {
  res.json(await authService.currentUser(sessionUser(req as SessionRequest).id));
});

// Delete the current session and clear the cookie.
export const logout: RequestHandler = handleRequest(async (req, res) => {
  const current = req as SessionRequest;
  await authService.logout(current.session?.sessionId);
  clearAuthCookie(res);
  res.status(204).end();
});

// Change the password, clear mustChangePassword, and destroy every session for the account.
export const changePassword: RequestHandler = handleRequest(async (req, res) => {
  const input = changePasswordBody(req.body);
  await authService.changePassword(sessionUser(req as SessionRequest).id, input.currentPassword, input.newPassword);
  clearAuthCookie(res);
  res.status(204).end();
});
