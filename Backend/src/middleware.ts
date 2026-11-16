import type { ErrorRequestHandler, RequestHandler } from 'express';
import { config } from './config';

export const requestLogger: RequestHandler = (req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
};

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error);
  const errorStatus = typeof error === 'object' && error !== null && 'status' in error
    ? error.status : undefined;
  const status = typeof errorStatus === 'number' && Number.isInteger(errorStatus)
    && errorStatus >= 400 && errorStatus < 600 ? errorStatus : 500;
  res.status(status).json({
    error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
    message: status >= 500 || config.nodeEnv === 'production'
      ? (status >= 500 ? 'An unexpected error occurred' : 'Invalid request')
      : error instanceof Error ? error.message : 'Invalid request',
  });
};
