import type { RequestHandler } from 'express';
import { HttpError } from '../errors';

// Respond to expected operation failures and forward unexpected errors.
export function handleRequest(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error instanceof HttpError && !res.headersSent) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      next(error);
    }
  };
}
