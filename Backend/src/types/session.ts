import type { Request } from 'express';

// The authentication owner stores the signed-in user's ID in the session.
export type SessionUser = {
  id: number;
};

export type UserSession = {
  sessionId?: string;
  currentUser?: SessionUser;
};

export type SessionRequest = Request & {
  session?: UserSession;
};

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
};

export type SessionAccount = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
};
