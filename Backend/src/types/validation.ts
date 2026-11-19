import type { CourseCreateData, CourseUpdateData, CourseStatus } from './courses';
import type { UserUpdateData, UserCreateData } from './users';
import type { EnrollmentCreateData, EnrollmentUpdateData, BulkEnrollmentData, BulkRemovalData } from './enrollments';
import type { CurrentUser } from './session';
import type { AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery } from './announcements';

// Validation middleware stores parsed values in response locals.
export type ValidatedLocals = {
  currentUser?: CurrentUser;
  announcementId?: number;
  resourceId?: number;
  announcementData?: AnnouncementCreateData;
  announcementUpdate?: AnnouncementUpdateData;
  announcementQuery?: AnnouncementQuery;
  courseId?: number;
  userId?: number;
  courseData?: CourseCreateData;
  courseUpdate?: CourseUpdateData;
  userData?: UserUpdateData;
  userCreate?: UserCreateData;
  enrollmentData?: EnrollmentCreateData;
  enrollmentUpdate?: EnrollmentUpdateData;
  courseStatus?: CourseStatus;
  bulkEnrollments?: BulkEnrollmentData;
  bulkRemoval?: BulkRemovalData;
};

export type ValidatedBodyField =
  'courseData' | 'courseUpdate' | 'userData' | 'userCreate' | 'announcementData' | 'announcementUpdate' |
  'enrollmentData' | 'enrollmentUpdate' | 'courseStatus' | 'bulkEnrollments' | 'bulkRemoval';
