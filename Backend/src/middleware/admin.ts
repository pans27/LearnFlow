import type { RequestHandler } from 'express';

// TODO(auth owner): implement session, CSRF, and administrator checks.

// Allow admin requests through until authentication is integrated.
export const requireAdmin: RequestHandler = (_req, _res, next) => {
  next();
};
