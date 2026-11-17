import { HttpError } from '../errors';
import type { CourseCreateData, CourseUpdateData, CourseStatus,
  EnrollmentCreateData, EnrollmentUpdateData, UserUpdateData, UserCreateData, BulkEnrollmentData, BulkRemovalData } from '../types';

// Raise a validation error with HTTP status 400.
function invalid(message: string): never {
  throw new HttpError(400, message);
}

// Parse a positive ID within the PostgreSQL integer range.
export function id(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value))) {
    return invalid('Invalid ID');
  }
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 2147483647) return invalid('Invalid ID');
  return result;
}

// Require a numeric ID in a JSON request body.
function bodyId(value: unknown): number {
  if (typeof value !== 'number') return invalid('Invalid ID');
  return id(value);
}

// Require a nonempty JSON object containing only allowed fields.
function body(value: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid('Body must be a JSON object');
  }
  const result = value as Record<string, unknown>;
  if (!Object.keys(result).length) return invalid('Body must contain at least one field');
  if (Object.keys(result).some((key) => !allowed.includes(key))) return invalid('Unknown body field');
  return result;
}

// Trim and validate a required text field.
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    return invalid(`${field} must be nonempty text of at most ${max} characters`);
  }
  return value.trim();
}

// Validate course creation or metadata update fields.
export function courseBody(value: unknown, partial?: false): CourseCreateData;
export function courseBody(value: unknown, partial: true): CourseUpdateData;
export function courseBody(value: unknown, partial = false): CourseCreateData | CourseUpdateData {
  const input = body(value, ['name', 'courseCode', 'description']);
  const result: CourseUpdateData = {};
  if (!partial || 'name' in input) result.name = text(input.name, 'name', 200);
  if ('courseCode' in input) result.courseCode = text(input.courseCode, 'courseCode', 50);
  if ('description' in input) {
    if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 10000)) {
      return invalid('description must be null or text of at most 10000 characters');
    }
    result.description = input.description as string | null;
  }
  return result;
}

// Validate an active or archived course status.
export function statusBody(value: unknown): CourseStatus {
  const input = body(value, ['status']);
  if (input.status !== 'active' && input.status !== 'archived') return invalid('Invalid course status');
  return input.status;
}

// Validate a membership role and the user ID when creating it.
export function enrollmentBody(value: unknown, create: true): EnrollmentCreateData;
export function enrollmentBody(value: unknown, create?: false): EnrollmentUpdateData;
export function enrollmentBody(value: unknown, create = false): EnrollmentCreateData | EnrollmentUpdateData {
  const input = body(value, create ? ['userId', 'role'] : ['role']);
  if (input.role !== 'student' && input.role !== 'instructor') return invalid('Invalid course role');
  if (create) return { role: input.role, userId: bodyId(input.userId) };
  return { role: input.role };
}

// Validate editable user fields without allowing password changes.
export function userBody(value: unknown): UserUpdateData {
  const input = body(value, ['name', 'isAdmin']);
  const result: UserUpdateData = {};
  if ('name' in input) result.name = text(input.name, 'name', 200);
  if ('isAdmin' in input) {
    if (typeof input.isAdmin !== 'boolean') return invalid('isAdmin must be boolean');
    result.isAdmin = input.isAdmin;
  }
  return result;
}

// Validate administrator-created accounts while rejecting caller-supplied passwords.
export function createUserBody(value: unknown): UserCreateData {
  const input = body(value, ['name', 'email', 'isAdmin']);
  const name = text(input.name, 'name', 200);
  if (typeof input.email !== 'string' || input.email.trim().length > 320
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    return invalid('email must be a valid email address');
  }
  if ('isAdmin' in input && typeof input.isAdmin !== 'boolean') return invalid('isAdmin must be boolean');
  return { name, email: input.email.trim().toLowerCase(), isAdmin: input.isAdmin === true };
}

// Require a batch containing between one and one hundred entries.
function batch(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    return invalid('Batch must contain between 1 and 100 entries');
  }
  return value;
}

// Reject duplicate users within a membership batch.
function uniqueUsers(userIds: number[]): void {
  if (new Set(userIds).size !== userIds.length) invalid('Duplicate user IDs in batch');
}

// Validate all membership additions before starting a database transaction.
export function bulkEnrollmentBody(value: unknown): BulkEnrollmentData {
  const input = body(value, ['enrollments']);
  const enrollments = batch(input.enrollments).map((entry) => enrollmentBody(entry, true));
  uniqueUsers(enrollments.map((entry) => entry.userId));
  return { enrollments };
}

// Validate all membership removal IDs before starting a database transaction.
export function bulkRemovalBody(value: unknown): BulkRemovalData {
  const input = body(value, ['userIds']);
  const userIds = batch(input.userIds).map(bodyId);
  uniqueUsers(userIds);
  return { userIds };
}
