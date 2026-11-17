import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

// Well-formed hash used when no account exists, so login still pays the scrypt cost.
const DUMMY_PASSWORD_HASH = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${'ab'.repeat(16)}$${'00'.repeat(KEY_LENGTH)}`;

// Derive a scrypt key with the parameters stored in the hash.
function derive(password: string, salt: string, keyLength: number, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: n, r, p }, (error, key) => error ? reject(error) : resolve(key));
  });
}

// Hash a password as scrypt$N$r$p$salt$hash for storage.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, KEY_LENGTH, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString('hex')}`;
}

// Compare a password with a stored scrypt hash without throwing on a malformed value.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, salt, key] = stored.split('$');
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (algorithm !== 'scrypt' || n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P || salt?.length !== 32 || key?.length !== KEY_LENGTH * 2 || !/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(key)) {
    return false;
  }
  let digest: Buffer;
  try {
    digest = await derive(password, salt, key.length / 2, n, r, p);
  } catch {
    return false;
  }
  const expected = Buffer.from(key, 'hex');
  return expected.length === digest.length && timingSafeEqual(expected, digest);
}

// Verify the supplied password, using a dummy hash when the account has none.
export function verifyLoginPassword(password: string, stored: string | undefined): Promise<boolean> {
  return verifyPassword(password, stored ?? DUMMY_PASSWORD_HASH);
}
