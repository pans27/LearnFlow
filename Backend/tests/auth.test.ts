import assert from 'node:assert/strict';
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { readAuthToken, signAuthToken } from '../src/auth/jwt';
import { HttpError } from '../src/errors';
import { changePasswordBody, loginBody } from '../src/validation/auth';

const invalid = (fn: () => unknown, message?: string) => assert.throws(fn, (error: unknown) =>
  error instanceof HttpError && error.status === 400 && (message === undefined || error.message === message));

test('password hashes use the scrypt format and verify only the original password', async () => {
  const password = 'temporary-password-1';
  const stored = await hashPassword(password);
  const [algorithm, n, r, p, salt, key] = stored.split('$');
  assert.equal(algorithm, 'scrypt');
  assert.ok(timingSafeEqual(Buffer.from(key, 'hex'), scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) })));
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('different-password', stored), false);
  assert.equal(await verifyPassword(password, 'test-only-invalid-hash'), false);
});

test('auth tokens reject a changed signature and an expired session', () => {
  const secret = 'test-jwt-secret-must-be-32-characters';
  const expiresAt = new Date(Date.now() + 60_000);
  const token = signAuthToken({ sid: 'session-1', uid: 7 }, secret, expiresAt);
  assert.deepEqual(readAuthToken(token, secret), { sid: 'session-1', uid: 7, exp: Math.floor(expiresAt.getTime() / 1000) });
  const [header, body, signature] = token.split('.');
  const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(readAuthToken(`${header}.${body}.${flipped}`, secret), undefined);
  assert.equal(readAuthToken(token, 'another-jwt-secret-must-be-32-characters'), undefined);
  const expired = signAuthToken({ sid: 'session-1', uid: 7 }, secret, new Date(Date.now() - 1000));
  assert.equal(readAuthToken(expired, secret), undefined);
  const digest = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  assert.equal(signature, digest);
});

test('login and password-change bodies reject unknown fields and weak passwords', () => {
  assert.deepEqual(loginBody({ email: ' Ada@Example.test ', password: 'secret' }), { email: 'ada@example.test', password: 'secret' });
  invalid(() => loginBody({ email: 'ada@example.test', password: 'secret', isAdmin: true }));
  invalid(() => loginBody({ email: 'not-an-email', password: 'secret' }), 'email must be a valid email address');
  invalid(() => loginBody({ email: 'ada@example.test', password: '' }), 'password must contain 1 to 128 characters');
  assert.equal(changePasswordBody({ currentPassword: 'temporary-password-1', newPassword: 'replacement-password' }).newPassword, 'replacement-password');
  invalid(() => changePasswordBody({ currentPassword: 'temporary-password-1', newPassword: 'short' }), 'newPassword must contain 12 to 128 characters');
  invalid(() => changePasswordBody({ currentPassword: 'temporary-password-1', newPassword: 'replacement-password', passwordHash: 'x' }));
});
