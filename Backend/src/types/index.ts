// Re-export domain types to preserve existing imports from the types folder.
export type {
  CourseStatus, CourseBody, CourseStatusBody, CourseCreateData, CourseUpdateData,
  CourseInsertData, CourseSaveData, CourseRecord, LockedCourse, CourseLockRow, CourseResponse,
} from './courses';
export type {
  UserBody, UserUpdateData, PublicUserRecord, UserResponse, CreateUserResponse,
} from './users';
export type {
  CourseRole, EnrollmentBody, EnrollmentCreateData, EnrollmentUpdateData,
  EnrollmentRecord, EnrollmentResponse,
  BulkEnrollmentBody, BulkEnrollmentData, BulkRemovalBody, BulkRemovalData,
} from './enrollments';
export type { ErrorResponse, HealthResponse } from './common';
export type { ValidatedLocals, ValidatedBodyField } from './validation';
