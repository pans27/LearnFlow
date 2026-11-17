import { hashPassword, verifyLoginPassword, verifyPassword } from '../auth/password';
import { signAuthToken } from '../auth/jwt';
import { config } from '../config';
import { authDb } from '../db/auth';
import { HttpError } from '../errors';
import type { UserResponse } from '../types';

type Account = NonNullable<Awaited<ReturnType<typeof authDb.findAccount>>>;

// Return the public account fields from a login or profile read.
function accountResponse(user: Account): UserResponse {
  return { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin, mustChangePassword: user.mustChangePassword };
}

export const authService = {
  // Check the password, then store the user id in a revocable session.
  async login(email: string, password: string): Promise<{ token: string; expiresAt: Date; user: UserResponse }> {
    const user = await authDb.findByEmail(email);
    const matches = await verifyLoginPassword(password, user?.passwordHash);
    if (!user?.isActive || !matches) throw new HttpError(401, 'Unauthorized');
    const expiresAt = new Date(Date.now() + config.sessionTtlMs);
    const session = await authDb.createSession(user.id, expiresAt);
    return { token: signAuthToken({ sid: session.id, uid: user.id }, config.jwtSecret, expiresAt), expiresAt, user: accountResponse(user) };
  },

  // Return the signed-in account, including a pending first-login password change.
  async currentUser(userId: number): Promise<UserResponse> {
    const user = await authDb.findAccount(userId);
    if (!user?.isActive) throw new HttpError(401, 'Unauthorized');
    return accountResponse(user);
  },

  // Destroy the session identified by the JWT.
  logout(sessionId: string | undefined): Promise<unknown> {
    return sessionId ? authDb.deleteSession(sessionId) : Promise.resolve();
  },

  // Verify the current password, store a new one, and sign the user out everywhere.
  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await authDb.findAccount(userId);
    if (!user?.isActive) throw new HttpError(401, 'Unauthorized');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
    if (currentPassword === newPassword) throw new HttpError(400, 'New password must differ from the current password');
    await authDb.replacePassword(userId, await hashPassword(newPassword));
  },
};
