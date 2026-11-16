import type { ErrorRequestHandler, RequestHandler } from 'express';

// Log the request timestamp, method, and path.
export const requestLogger: RequestHandler = (req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
};

// Return a JSON error for an unmatched route.
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "Not found" });
};

// Log unhandled errors and return HTTP 500.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: 'An unexpected error occurred' });
};
