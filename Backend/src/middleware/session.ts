import type { RequestHandler } from 'express';
import { readCookie } from '../auth/cookies';
import { readAuthToken } from '../auth/jwt';
import { config } from '../config';
import { authDb } from '../db/auth';
import type { SessionRequest } from '../types';

// Attach session.currentUser from a valid JWT cookie. Requests without the cookie are unchanged.
export const loadSession: RequestHandler = async (req, _res, next) => {
  try {
    const token = readCookie(req, config.authCookie);
    if (!token) return next();
    const payload = readAuthToken(token, config.jwtSecret);
    if (!payload) return next();
    const session = await authDb.findSession(payload.sid);
    if (!session || session.userId !== payload.uid || session.expiresAt.getTime() <= Date.now()) {
      if (session && session.expiresAt.getTime() <= Date.now()) await authDb.deleteSession(session.id).catch(() => undefined);
      return next();
    }
    (req as SessionRequest).session = { sessionId: session.id, currentUser: { id: session.userId } };
    next();
  } catch (error) {
    next(error);
  }
};
