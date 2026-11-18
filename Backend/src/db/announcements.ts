import { Prisma } from '../../generated/prisma/client';
import type { AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery } from '../types';
import { HttpError } from '../errors';

const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.AnnouncementOrderByWithRelationInput[];

export const announcementDb = {
  // Fetch a course-scoped announcement while respecting student visibility.
  find: (tx: Prisma.TransactionClient, courseId: number, announcementId: number, manage: boolean) =>
    tx.announcement.findFirst({ where: { id: announcementId, courseId, ...(manage ? {} : { isVisible: true }) } }),

  // Fetch the requested number of course announcements in newest-first order.
  list: (tx: Prisma.TransactionClient, courseId: number, manage: boolean, query: AnnouncementQuery) =>
    tx.announcement.findMany({ where: { courseId, ...(manage ? {} : { isVisible: true }) },
      orderBy: newestFirst, take: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }) }),

  // Insert an announcement authored by the authenticated account.
  create: async (tx: Prisma.TransactionClient, courseId: number, authorId: number, data: AnnouncementCreateData) => {
    try {
      return await tx.announcement.create({ data: { ...data, courseId, authorId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new HttpError(409, 'Course or author is no longer available');
      }
      throw error;
    }
  },

  // Update only the announcement belonging to the requested course.
  update: async (tx: Prisma.TransactionClient, courseId: number, announcementId: number, data: AnnouncementUpdateData) => {
    try {
      return await tx.announcement.update({ where: { id: announcementId, courseId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Announcement not found');
      }
      throw error;
    }
  },

  // Delete one course-scoped announcement and report missing records locally.
  remove: async (tx: Prisma.TransactionClient, courseId: number, announcementId: number) => {
    const result = await tx.announcement.deleteMany({ where: { id: announcementId, courseId } });
    if (!result.count) throw new HttpError(404, 'Announcement not found');
  },
};
