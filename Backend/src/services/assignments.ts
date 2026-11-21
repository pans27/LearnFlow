import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, AssignmentCreateData, AssignmentUpdateData, ResourceFile } from '../types';
import { assignmentDb as database } from '../db/assignments';
import { courseDb } from '../db/courses';
import { requireCourseAccess } from './courses';
import { putPdf, deleteObject, signedGetUrl } from '../storage/s3';
import { HttpError } from '../errors';

// Require an active course for assignment changes while allowing authorized reads of archived courses.
function requireActive(status: string): void {
  if (status !== 'active') throw new HttpError(409, 'Reactivate this course before changing it');
}

// Require instructor or administrator permission for assignment management.
async function requireManager(tx: Prisma.TransactionClient, courseId: number, user: CurrentUser, write = false) {
  const course = await requireCourseAccess(tx, courseId, user);
  if (!user.isAdmin && course.role !== 'instructor') throw new HttpError(403, 'Forbidden');
  if (write) requireActive(course.status);
  return course;
}

// Load an assignment while hiding unpublished assignments from students.
async function accessibleAssignment(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser) {
  const course = await requireCourseAccess(tx, courseId, user);
  const assignment = await database.find(tx, courseId, id);
  if (!assignment || (!user.isAdmin && course.role !== 'instructor' && !assignment.isVisible)) throw new HttpError(404, 'Assignment not found');
  return { course, assignment };
}

// Check student enrollment, availability, deadline, and permission to replace submitted work.
async function requireUpload(tx: Prisma.TransactionClient, courseId: number, id: number, user: CurrentUser) {
  const { course, assignment } = await accessibleAssignment(tx, courseId, id, user);
  requireActive(course.status);
  if (course.role !== 'student') throw new HttpError(403, 'Forbidden');
  if (!assignment.isVisible) throw new HttpError(404, 'Assignment not found');
  if (assignment.dueAt && assignment.dueAt.getTime() <= Date.now()) throw new HttpError(409, 'Assignment deadline has passed');
  const previous = await database.own(tx, courseId, id, user.id);
  if (previous && !assignment.allowResubmission) throw new HttpError(409, 'Resubmission is not allowed');
  return previous;
}

// Attempt object cleanup without turning an already committed submission into a failed request.
async function cleanupFile(key: string): Promise<void> {
  try { await deleteObject(key); }
  catch (error) { console.error('Assignment file cleanup failed:', error); }
}

export const assignmentService = {
  // List published assignments for students or all assignments for course managers.
  list(courseId: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      const course = await requireCourseAccess(tx, courseId, user);
      return database.list(tx, courseId, user.isAdmin || course.role === 'instructor');
    });
  },

  // Return an assignment after checking course membership and visibility.
  get(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => (await accessibleAssignment(tx, courseId, id, user)).assignment);
  },

  // Create assignment settings in an active course managed by the caller.
  create(courseId: number, user: CurrentUser, data: AssignmentCreateData) {
    return database.write(async (tx) => {
      await requireManager(tx, courseId, user, true);
      return database.create(tx, courseId, user.id, data);
    });
  },

  // Change assignment metadata, publication, or resubmission permission.
  update(courseId: number, id: number, user: CurrentUser, data: AssignmentUpdateData) {
    return database.write(async (tx) => {
      await requireManager(tx, courseId, user, true);
      return database.update(tx, courseId, id, data);
    });
  },

  // Delete an unsubmitted assignment while preserving assignments containing student work.
  remove(courseId: number, id: number, user: CurrentUser) {
    return database.write(async (tx) => {
      await requireManager(tx, courseId, user, true);
      await database.remove(tx, courseId, id);
    });
  },

  // Replace the current student's submission only when the instructor permits it.
  async upload(courseId: number, id: number, user: CurrentUser, file: ResourceFile) {
    await courseDb.read((tx) => requireUpload(tx, courseId, id, user));
    const key = `assignments/${courseId}/${id}/${user.id}/${randomUUID()}.pdf`;
    await putPdf(key, file.body);
    let saved;
    try {
      saved = await database.write(async (tx) => {
        await database.lockSubmission(tx, id, user.id);
        const previous = await requireUpload(tx, courseId, id, user);
        const item = await database.saveSubmission(tx, courseId, id, user.id, { s3Key: key, originalFilename: file.filename });
        return { item, previous };
      });
    } catch (error) {
      await cleanupFile(key);
      throw error;
    }
    if (saved.previous) await cleanupFile(saved.previous.s3Key);
    return saved.item;
  },

  // Return the caller's current submission without exposing another student's file.
  own(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      await accessibleAssignment(tx, courseId, id, user);
      const item = await database.own(tx, courseId, id, user.id);
      if (!item) throw new HttpError(404, 'Submission not found');
      return item;
    });
  },

  // Return the latest submission of each student to course instructors and administrators.
  submissions(courseId: number, id: number, user: CurrentUser) {
    return courseDb.read(async (tx) => {
      await requireManager(tx, courseId, user);
      await accessibleAssignment(tx, courseId, id, user);
      return database.submissions(tx, courseId, id);
    });
  },

  // Sign a download URL for a submission owner or authorized course manager.
  async download(courseId: number, id: number, submissionId: number, user: CurrentUser) {
    const item = await courseDb.read(async (tx) => {
      const { course } = await accessibleAssignment(tx, courseId, id, user);
      const item = await database.submission(tx, courseId, id, submissionId);
      if (!item) throw new HttpError(404, 'Submission not found');
      if (!user.isAdmin && course.role !== 'instructor' && item.studentId !== user.id) throw new HttpError(403, 'Forbidden');
      return item;
    });
    return signedGetUrl(item.s3Key, item.originalFilename, true);
  },
};
