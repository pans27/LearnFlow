import type { Request, Response } from 'express';
import { config } from '../config';

// Read one cookie from the request header.
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Store the signed session token in an HttpOnly cookie. SameSite=Lax blocks cross-site posts.
export function setAuthCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(config.authCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    expires: expiresAt,
  });
}

// Remove the auth cookie using the same attributes used when it was set.
export function clearAuthCookie(res: Response): void {
  res.clearCookie(config.authCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
  });
}
