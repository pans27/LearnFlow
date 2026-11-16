import type { LockedCourse, CourseCreateData, CourseUpdateData, UserUpdateData, CourseStatus, CourseRole, BulkEnrollmentData, BulkRemovalData } from '../types';
import { adminDb as database } from '../db/admin';
import { HttpError } from '../errors';

// Reject changes to an archived course.
function requireActive(course: LockedCourse) {
  if (course.status !== 'active') throw new HttpError(409, 'Reactivate this course before changing it');
}

export const adminService = {

  // Add all memberships to an active course in one transaction.
  createEnrollments(courseId: number, data: BulkEnrollmentData) {
    return database.withCourse(courseId, async (tx, course) => {
      requireActive(course);
      const accounts = await database.findAccounts(tx, data.enrollments.map((entry) => entry.userId));
      if (accounts.length !== data.enrollments.length) throw new HttpError(404, 'A user in the batch was not found');
      if (accounts.some((account) => !account.isActive)) throw new HttpError(409, 'Cannot enroll an inactive account');
      return database.createEnrollments(tx, courseId, data.enrollments);
    });
  },

  // Remove all requested memberships from an active course in one transaction.
  removeEnrollments(courseId: number, data: BulkRemovalData) {
    return database.withCourse(courseId, async (tx, course) => {
      requireActive(course);
      await database.removeEnrollments(tx, courseId, data.userIds);
    });
  },

  // List users through the database.
  listUsers: database.listUsers,

  // Find a user or report that it does not exist.
  async getUser(id: number) {
    const user = await database.findUser(id);
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  },

  // Update user details while preserving at least one active administrator.
  updateUser(id: number, data: UserUpdateData) {
    return database.withAdminLock(async (tx) => {
      const user = await database.findUserForUpdate(tx, id);
      if (!user) throw new HttpError(404, 'User not found');
      if (user.isAdmin && user.isActive && data.isAdmin === false) {
        const count = await database.countActiveAdmins(tx);
        if (count <= 1) throw new HttpError(409, 'Cannot remove the last active administrator');
      }
      return database.updateUser(tx, id, data);
    });
  },

  // List all courses through the database.
  listCourses: database.listCourses,

  // Create a course with a default code when none is supplied.
  createCourse(data: CourseCreateData) {
    if (!data.name) throw new HttpError(400, 'name is required');
    // Preserve the existing name-only request contract; clients may supply a code.
    return database.createCourse({ ...data, name: data.name, courseCode: data.courseCode ?? data.name });
  },

  // Update metadata only while the course is active.
  updateCourse(id: number, data: CourseUpdateData) {
    return database.withCourse(id, async (tx, course) => {
      // Reject changes to an archived course.
      requireActive(course);
      return database.updateCourse(tx, id, data);
    });
  },

  // Archive or reactivate a course under its transaction lock.
  setCourseStatus(id: number, status: CourseStatus) {
    return database.withCourse(id, (tx) => database.updateCourse(tx, id, { status }));
  },

  // List memberships after confirming that the course exists.
  listEnrollments(courseId: number) {
    return database.withCourse(courseId, (tx) =>
      database.listEnrollments(tx, courseId));
  },

  // Enroll an active account into an active course.
  createEnrollment(courseId: number, userId: number, role: CourseRole) {
    return database.withCourse(courseId, async (tx, course) => {
      // Reject changes to an archived course.
      requireActive(course);
      const user = await database.findActiveAccount(tx, userId);
      if (!user) throw new HttpError(404, 'User not found');
      if (!user.isActive) throw new HttpError(409, 'Cannot enroll an inactive account');
      return database.createEnrollment(tx, courseId, userId, role);
    });
  },

  // Change a membership role only while its course is active.
  updateEnrollment(courseId: number, userId: number, role: CourseRole) {
    return database.withCourse(courseId, async (tx, course) => {
      // Reject changes to an archived course.
      requireActive(course);
      return database.updateEnrollment(tx, courseId, userId, role);
    });
  },
  
  // Remove membership from an active course without deleting content.
  removeEnrollment(courseId: number, userId: number) {
    return database.withCourse(courseId, async (tx, course) => {
      // Reject changes to an archived course.
      requireActive(course);
      // Delete membership only: authored content/submission history is retained.
      await database.removeEnrollment(tx, courseId, userId);
    });
  },
};
