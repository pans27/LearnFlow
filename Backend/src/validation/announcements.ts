import type { RequestHandler } from 'express';
import type { AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery, ValidatedLocals } from '../types';
import { DEFAULT_ANNOUNCEMENT_PAGE_SIZE, MAX_ANNOUNCEMENT_PAGE_SIZE } from '../constants/announcements';
import { HttpError } from '../errors';
import { id } from './admin';
import { handleRequest } from '../middleware/handler';

// Require a nonempty announcement body containing only editable fields.
function fields(value: unknown): AnnouncementUpdateData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'Body must be a JSON object');
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).length) throw new HttpError(400, 'Body must contain at least one field');
  if (Object.keys(input).some((key) => !['title', 'body', 'isVisible'].includes(key))) throw new HttpError(400, 'Unknown body field');
  const result: AnnouncementUpdateData = {};
  for (const key of ['title', 'body'] as const) {
    if (!(key in input)) continue;
    const max = key === 'title' ? 200 : 20000;
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
      throw new HttpError(400, `${key} must be nonempty text of at most ${max} characters`);
    }
    result[key] = value.trim();
  }
  if ('isVisible' in input) {
    if (typeof input.isVisible !== 'boolean') throw new HttpError(400, 'isVisible must be boolean');
    result.isVisible = input.isVisible;
  }
  return result;
}

// Validate required publication fields and default visibility to visible.
export function createAnnouncementBody(value: unknown): AnnouncementCreateData {
  const result = fields(value);
  if (!result.title || !result.body) throw new HttpError(400, 'title and body are required');
  return { title: result.title, body: result.body, isVisible: result.isVisible ?? true };
}

// Validate a partial announcement update without changing omitted fields.
export function updateAnnouncementBody(value: unknown): AnnouncementUpdateData {
  return fields(value);
}

// Validate the page size and optional announcement cursor from URL query parameters.
export function announcementQuery(value: unknown): AnnouncementQuery {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'Invalid query');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['limit', 'cursor'].includes(key))) throw new HttpError(400, 'Unknown query field');
  const limit = input.limit === undefined ? DEFAULT_ANNOUNCEMENT_PAGE_SIZE : id(input.limit);
  if (limit > MAX_ANNOUNCEMENT_PAGE_SIZE) throw new HttpError(400, `limit must be between 1 and ${MAX_ANNOUNCEMENT_PAGE_SIZE}`);
  return { limit, ...(input.cursor === undefined ? {} : { cursor: id(input.cursor) }) };
}

// Store a validated announcement page request in response locals.
export const validateAnnouncementQuery: RequestHandler = handleRequest((req, res, next) => {
  (res.locals as ValidatedLocals).announcementQuery = announcementQuery(req.query);
  next();
});
