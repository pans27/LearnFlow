import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery, AnnouncementPage } from '../types';
import { courseDb, withCourseTransaction } from '../db/courses';
import { announcementDb } from '../db/announcements';
import { requireCourseAccess } from './courses';
import { HttpError } from '../errors';

// Require instructor or administrator permission and reject writes to archived courses.
async function requireWriteAccess(tx: Prisma.TransactionClient, courseId: number, user: CurrentUser): Promise<void> {
  const course = await requireCourseAccess(tx, courseId, user);
  if (!user.isAdmin && course.role !== 'instructor') throw new HttpError(403, 'Forbidden');
  if (course.status !== 'active') throw new HttpError(409, 'Reactivate this course before changing it');
}

export const announcementService = {
  // List announcements visible to the current course member with cursor pagination.
  list(courseId: number, user: CurrentUser, query: AnnouncementQuery): Promise<AnnouncementPage> {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      const manage = user.isAdmin || course.role === 'instructor';
      if (query.cursor !== undefined && !await announcementDb.find(tx, courseId, query.cursor, manage)) {
        throw new HttpError(400, 'Invalid announcement cursor');
      }
      const rows = await announcementDb.list(tx, courseId, manage, { ...query, limit: query.limit + 1 });
      const items = rows.slice(0, query.limit);
      return { items, ...(rows.length > query.limit ? { nextCursor: items[items.length - 1].id } : {}) };
    });
  },

  // Return one visible announcement after checking course membership.
  get(courseId: number, announcementId: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      const item = await announcementDb.find(tx, courseId, announcementId, user.isAdmin || course.role === 'instructor');
      if (!item) throw new HttpError(404, 'Announcement not found');
      return item;
    });
  },

  // Create an announcement after checking permission and course status.
  create(courseId: number, user: CurrentUser, data: AnnouncementCreateData) {
    return withCourseTransaction(courseId, async (tx) => {
      await requireWriteAccess(tx, courseId, user);
      return announcementDb.create(tx, courseId, user.id, data);
    });
  },

  // Update announcement text or visibility without changing its course or author.
  update(courseId: number, announcementId: number, user: CurrentUser, data: AnnouncementUpdateData) {
    return withCourseTransaction(courseId, async (tx) => {
      await requireWriteAccess(tx, courseId, user);
      return announcementDb.update(tx, courseId, announcementId, data);
    });
  },

  // Delete an announcement only when the current account can manage its active course.
  remove(courseId: number, announcementId: number, user: CurrentUser) {
    return withCourseTransaction(courseId, async (tx) => {
      await requireWriteAccess(tx, courseId, user);
      await announcementDb.remove(tx, courseId, announcementId);
    });
  },
};
