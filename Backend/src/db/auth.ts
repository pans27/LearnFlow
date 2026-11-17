import { randomBytes } from 'node:crypto';
import { getPrisma } from '../database';

const accountSelect = {
  id: true, name: true, email: true, passwordHash: true, isAdmin: true, isActive: true, mustChangePassword: true,
} as const;

export const authDb = {
  // Find an account by email without distinguishing letter case.
  findByEmail: (email: string) => getPrisma().user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: accountSelect,
  }),

  // Load the password hash and flags for the signed-in account.
  findAccount: (id: number) => getPrisma().user.findUnique({ where: { id }, select: accountSelect }),

  // Persist { currentUser: { id } } so logout and password changes can revoke it.
  createSession: (userId: number, expiresAt: Date) => getPrisma().session.create({
    data: { id: randomBytes(32).toString('base64url'), userId, sessionData: { currentUser: { id: userId } }, expiresAt },
  }),

  // Load a session row by the id carried in the JWT.
  findSession: (id: string) => getPrisma().session.findUnique({ where: { id } }),

  // Delete one session. Missing rows are a successful logout.
  deleteSession: (id: string) => getPrisma().session.deleteMany({ where: { id } }),

  // Replace the password, clear the first-login flag, and revoke every session.
  replacePassword: (userId: number, passwordHash: string) => {
    const prisma = getPrisma();
    return prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
  },
};
