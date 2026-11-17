import type { CourseCreateData, CourseUpdateData, CourseStatus } from './courses';
import type { UserUpdateData, UserCreateData } from './users';
import type { EnrollmentCreateData, EnrollmentUpdateData, BulkEnrollmentData, BulkRemovalData } from './enrollments';
import type { CurrentUser } from './session';

// Validation middleware stores parsed values in response locals.
export type ValidatedLocals = {
  currentUser?: CurrentUser;
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
  'courseData' | 'courseUpdate' | 'userData' | 'userCreate' |
  'enrollmentData' | 'enrollmentUpdate' | 'courseStatus' | 'bulkEnrollments' | 'bulkRemoval';
