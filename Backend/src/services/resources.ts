import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, ResourceRecord, StoredResourceType, ResourceFile, ResourceUploadFields } from '../types';
import { courseDb, withCourseTransaction } from '../db/courses';
import { resourceDb } from '../db/resources';
import { requireCourseAccess } from './courses';
import { deleteObject, putPdf, signedGetUrl } from '../storage/s3';
import { HttpError } from '../errors';

// Allow instructors and administrators to manage every course file.
function canManage(user: CurrentUser, role: string | null): boolean {
  return user.isAdmin || role === 'instructor';
}

// Reject writes to an archived course after membership has been checked.
function requireActiveCourse(status: string): void {
  if (status !== 'active') throw new HttpError(409, 'Reactivate this course before changing it');
}

// Load a visible resource or report that it is not available to this account.
async function visibleResource(tx: Prisma.TransactionClient, courseId: number, resourceId: number, user: CurrentUser): Promise<ResourceRecord> {
  const course = await requireCourseAccess(tx, courseId, user);
  const resource = await resourceDb.find(tx, courseId, resourceId, user.id, canManage(user, course.role));
  if (!resource) throw new HttpError(404, 'Resource not found');
  return resource;
}

export const resourceService = {
  // List the course files the current account is allowed to see.
  list(courseId: number, user: CurrentUser, resourceType?: StoredResourceType) {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      return resourceDb.list(tx, courseId, user.id, canManage(user, course.role), resourceType);
    });
  },

  // Search visible PDF page text after confirming the account can open the course.
  search(courseId: number, user: CurrentUser, query: string) {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      return resourceDb.search(tx, courseId, user.id, canManage(user, course.role), query);
    });
  },

  // Return one resource and its extraction status.
  get(courseId: number, resourceId: number, user: CurrentUser) {
    return courseDb.read((tx) => visibleResource(tx, courseId, resourceId, user));
  },

  // Store a PDF in S3, then record it for the course and queue text extraction.
  async upload(courseId: number, user: CurrentUser, file: ResourceFile, fields: ResourceUploadFields) {
    const course = await courseDb.read((tx) => requireCourseAccess(tx, courseId, user));
    requireActiveCourse(course.status);
    const manage = canManage(user, course.role);
    if (fields.resourceType === 'instructor_material' && !manage) throw new HttpError(403, 'Forbidden');
    if (fields.resourceType === 'student_note' && !manage && course.role !== 'student') throw new HttpError(403, 'Forbidden');
    const key = `resources/${courseId}/${randomUUID()}.pdf`;
    await putPdf(key, file.body);
    try {
      return await withCourseTransaction(courseId, async (tx) => {
        const current = await requireCourseAccess(tx, courseId, user);
        requireActiveCourse(current.status);
        return resourceDb.create(tx, courseId, user.id, { ...fields, originalFilename: file.filename || 'document.pdf', fileSizeBytes: file.body.length, s3Key: key });
      });
    } catch (error) {
      await deleteObject(key).catch(() => undefined);
      throw error;
    }
  },

  // Sign a temporary URL for preview or download.
  async url(courseId: number, resourceId: number, user: CurrentUser, download: boolean) {
    const resource = await courseDb.read((tx) => visibleResource(tx, courseId, resourceId, user));
    return signedGetUrl(resource.s3Key, resource.originalFilename, download);
  },

  // Delete the database row, then delete the stored PDF.
  async remove(courseId: number, resourceId: number, user: CurrentUser) {
    const resource = await withCourseTransaction(courseId, async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      requireActiveCourse(course.status);
      const current = await resourceDb.find(tx, courseId, resourceId, user.id, canManage(user, course.role));
      if (!current) throw new HttpError(404, 'Resource not found');
      const owner = current.ownerId === user.id;
      if (!canManage(user, course.role) && !owner) throw new HttpError(403, 'Forbidden');
      await resourceDb.remove(tx, courseId, resourceId);
      return current;
    });
    await deleteObject(resource.s3Key);
  },
};
