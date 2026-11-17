import { HttpError } from '../errors';

export type LoginInput = {
  email: string;
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

// Raise a validation error with HTTP status 400.
function invalid(message: string): never {
  throw new HttpError(400, message);
}

// Require a JSON object that contains only the named fields.
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('Body must be a JSON object');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) invalid('Unknown body field');
  return result;
}

// Validate the email and password submitted to login.
export function loginBody(value: unknown): LoginInput {
  const input = object(value, ['email', 'password']);
  if (typeof input.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) || input.email.trim().length > 320) {
    invalid('email must be a valid email address');
  }
  if (typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 128) {
    invalid('password must contain 1 to 128 characters');
  }
  return { email: input.email.trim().toLowerCase(), password: input.password };
}

// Validate a password change, including the 12-character minimum for the new password.
export function changePasswordBody(value: unknown): ChangePasswordInput {
  const input = object(value, ['currentPassword', 'newPassword']);
  if (typeof input.currentPassword !== 'string' || input.currentPassword.length < 1 || input.currentPassword.length > 128) {
    invalid('currentPassword must contain 1 to 128 characters');
  }
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 12 || input.newPassword.length > 128) {
    invalid('newPassword must contain 12 to 128 characters');
  }
  return { currentPassword: input.currentPassword, newPassword: input.newPassword };
}
