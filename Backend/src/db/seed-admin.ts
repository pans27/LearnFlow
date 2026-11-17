import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { getPrisma } from '../database';
import type { DefaultAdminOptions, DefaultAdminResult } from '../types';

// Create the default administrator once without overwriting an existing account.
export function seedDefaultAdmin(options: DefaultAdminOptions = {}): Promise<DefaultAdminResult> {
  const email = (options.email ?? 'admin@learnflow.local').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('DEFAULT_ADMIN_EMAIL must be a valid email address');
  return getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1724001)::text`;
    const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, isAdmin: true, isActive: true } });
    if (existing) {
      if (!existing.isAdmin || !existing.isActive) {
        throw new Error('The default admin email belongs to a non-admin or inactive account; no changes were made');
      }
      return { id: existing.id, email: existing.email, created: false };
    }
    const password = options.password ?? randomBytes(24).toString('base64url');
    if (password.length < 16 || password.length > 128) {
      throw new Error('DEFAULT_ADMIN_PASSWORD must contain 16 to 128 characters');
    }
    const passwordHash = await hashPassword(password);
    const user = await tx.user.create({ data: { email, name: 'Default Administrator', passwordHash,
      isAdmin: true, isActive: true, mustChangePassword: true }, select: { id: true, email: true } });
    return { ...user, created: true, temporaryPassword: password };
  });
}
