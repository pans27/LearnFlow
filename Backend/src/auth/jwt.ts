import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthToken = {
  sid: string;
  uid: number;
  exp: number;
};

// Sign a session id and user id as an HS256 JWT that expires with the session row.
export function signAuthToken(token: Omit<AuthToken, 'exp'>, secret: string, expiresAt: Date): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sid: token.sid, uid: token.uid, exp: Math.floor(expiresAt.getTime() / 1000) })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Return the token payload when the signature and expiry are valid.
export function readAuthToken(token: string, secret: string, now = Date.now()): AuthToken | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [header, body, signature] = parts;
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const headerJson = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string };
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Partial<AuthToken>;
    if (headerJson.alg !== 'HS256' || typeof payload.sid !== 'string' || !payload.sid) return undefined;
    if (typeof payload.uid !== 'number' || !Number.isInteger(payload.uid) || payload.uid < 1 || payload.uid > 2147483647) return undefined;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return undefined;
    return { sid: payload.sid, uid: payload.uid, exp: payload.exp };
  } catch {
    return undefined;
  }
}
