import type { RequestHandler } from 'express';
import { readCookie } from '../auth/cookies';
import { readAuthToken } from '../auth/jwt';
import { config } from '../config';
import { authDb } from '../db/auth';
import type { SessionRequest } from '../types';

// Attach session.currentUser only from a verified, unexpired JWT and database session.
export const loadSession: RequestHandler = async (req, _res, next) => {
  (req as SessionRequest).session = undefined;
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
