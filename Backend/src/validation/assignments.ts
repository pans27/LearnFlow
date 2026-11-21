import type { AssignmentCreateData, AssignmentUpdateData, AssignmentGradeData } from '../types';
import { HttpError } from '../errors';

// Validate editable assignment fields without accepting ownership or course changes.
export function updateAssignmentBody(value: unknown): AssignmentUpdateData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Body must be a JSON object');
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).length) throw new HttpError(400, 'Body must contain at least one field');
  if (Object.keys(input).some((key) => !['title', 'description', 'dueAt', 'isVisible', 'allowResubmission', 'gradesVisible', 'maxMark'].includes(key))) {
    throw new HttpError(400, 'Unknown body field');
  }
  const result: AssignmentUpdateData = {};
  if ('maxMark' in input) {
    if (typeof input.maxMark !== 'number' || !Number.isFinite(input.maxMark) || input.maxMark <= 0) throw new HttpError(400, 'maxMark must be a positive finite number');
    result.maxMark = input.maxMark;
  }
  if ('title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) throw new HttpError(400, 'title must be nonempty text of at most 200 characters');
    result.title = input.title.trim();
  }
  if ('description' in input) {
    if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 20000)) throw new HttpError(400, 'description must be text of at most 20000 characters or null');
    result.description = input.description as string | null;
  }
  if ('dueAt' in input) {
    if (input.dueAt !== null && (typeof input.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(input.dueAt) || !Number.isFinite(Date.parse(input.dueAt)))) {
      throw new HttpError(400, 'dueAt must be an ISO timestamp with timezone or null');
    }
    result.dueAt = input.dueAt === null ? null : new Date(input.dueAt as string);
  }
  for (const key of ['isVisible', 'allowResubmission', 'gradesVisible'] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'boolean') throw new HttpError(400, `${key} must be boolean`);
    result[key] = input[key];
  }
  return result;
}

// Require a title and default new assignments to hidden with resubmission disabled.
export function createAssignmentBody(value: unknown): AssignmentCreateData {
  const data = updateAssignmentBody(value);
  if (!data.title) throw new HttpError(400, 'title is required');
  return { ...data, title: data.title, isVisible: data.isVisible ?? false, allowResubmission: data.allowResubmission ?? false, gradesVisible: data.gradesVisible ?? false, maxMark: data.maxMark ?? 100 };
}

// Validate a nonnegative finite mark or null to clear an existing grade.
export function assignmentGradeBody(value: unknown): AssignmentGradeData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Body must be a JSON object');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'mark')) throw new HttpError(400, 'Unknown body field');
  if (input.mark !== null && (typeof input.mark !== 'number' || !Number.isFinite(input.mark) || input.mark < 0)) {
    throw new HttpError(400, 'mark must be a nonnegative finite number or null');
  }
  return { mark: input.mark as number | null };
}
