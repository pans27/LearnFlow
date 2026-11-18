import type { RequestHandler } from 'express';
import type { AnnouncementRecord, AnnouncementResponse, ValidatedLocals } from '../types';
import { handleRequest } from '../middleware/handler';
import { requireUser } from '../middleware/current-user';
import { requireId } from '../middleware/validation';
import { announcementService } from '../services/announcements';

// Serialize announcement timestamps while keeping numeric identifiers.
function announcementResponse(item: AnnouncementRecord): AnnouncementResponse {
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

// Return an announcement page and its next-page cursor when more results exist.
export const list: RequestHandler = handleRequest(async (_req, res) => {
  const { announcementQuery } = res.locals as ValidatedLocals;
  if (!announcementQuery) throw new Error('Missing validated announcement query');
  const page = await announcementService.list(requireId(res, 'courseId'), requireUser(res), announcementQuery);
  if (page.nextCursor !== undefined) res.set('X-Next-Cursor', String(page.nextCursor));
  res.json(page.items.map(announcementResponse));
});

// Return one course-scoped announcement to an authorized account.
export const get: RequestHandler = handleRequest(async (_req, res) => {
  res.json(announcementResponse(await announcementService.get(requireId(res, 'courseId'), requireId(res, 'announcementId'), requireUser(res))));
});

// Create an announcement using the current session user as its author.
export const create: RequestHandler = handleRequest(async (_req, res) => {
  const { announcementData } = res.locals as ValidatedLocals;
  if (!announcementData) throw new Error('Missing validated announcement data');
  const item = await announcementService.create(requireId(res, 'courseId'), requireUser(res), announcementData);
  res.status(201).json(announcementResponse(item));
});

// Return an announcement after updating its validated fields.
export const update: RequestHandler = handleRequest(async (_req, res) => {
  const { announcementUpdate } = res.locals as ValidatedLocals;
  if (!announcementUpdate) throw new Error('Missing validated announcement update');
  res.json(announcementResponse(await announcementService.update(requireId(res, 'courseId'), requireId(res, 'announcementId'), requireUser(res), announcementUpdate)));
});

// Delete an announcement and return HTTP 204 without a response body.
export const remove: RequestHandler = handleRequest(async (_req, res) => {
  await announcementService.remove(requireId(res, 'courseId'), requireId(res, 'announcementId'), requireUser(res));
  res.status(204).end();
});
