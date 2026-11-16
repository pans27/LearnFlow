import { getPrisma } from '../database';
import type { SessionAccount } from '../types';

export const userDb = {
  // Reload account flags without retrieving password hashes or session secrets.
  findSessionAccount: (id: number): Promise<SessionAccount | null> => getPrisma().user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isAdmin: true, isActive: true, mustChangePassword: true },
  }),
};
