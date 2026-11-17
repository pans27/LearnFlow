import 'dotenv/config';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const configuredSecret = process.env.JWT_SECRET?.trim() ?? '';
if (configuredSecret.length < 32 && (process.env.NODE_ENV ?? 'development') === 'production') {
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

export const config = {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: configuredSecret.length >= 32 ? configuredSecret : 'development-only-jwt-secret-change-me',
  sessionTtlMs,
  authCookie: 'learnflow.sid',
};
