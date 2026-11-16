import type { CourseCreateData, CourseUpdateData, CourseStatus } from './courses';
import type { UserUpdateData } from './users';
import type { EnrollmentCreateData, EnrollmentUpdateData, BulkEnrollmentData, BulkRemovalData } from './enrollments';

// Validation middleware stores parsed values in response locals.
export type ValidatedLocals = {
  courseId?: number;
  userId?: number;
  courseData?: CourseCreateData;
  courseUpdate?: CourseUpdateData;
  userData?: UserUpdateData;
  enrollmentData?: EnrollmentCreateData;
  enrollmentUpdate?: EnrollmentUpdateData;
  courseStatus?: CourseStatus;
  bulkEnrollments?: BulkEnrollmentData;
  bulkRemoval?: BulkRemovalData;
};

export type ValidatedBodyField =
  'courseData' | 'courseUpdate' | 'userData' |
  'enrollmentData' | 'enrollmentUpdate' | 'courseStatus' | 'bulkEnrollments' | 'bulkRemoval';
