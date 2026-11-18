// Re-export domain types to preserve existing imports from the types folder.
export type {
  CourseStatus, CourseBody, CourseStatusBody, CourseCreateData, CourseUpdateData,
  CourseInsertData, CourseSaveData, CourseRecord, CourseState, CourseResponse,
  AccessibleCourseResponse, CourseAccessRecord,
} from './courses';
export type {
  UserBody, UserUpdateData, UserCreateData, PublicUserRecord, UserResponse, CreateUserResponse,
  DefaultAdminOptions, DefaultAdminResult,
} from './users';
export type {
  CourseRole, EnrollmentBody, EnrollmentCreateData, EnrollmentUpdateData,
  EnrollmentRecord, EnrollmentResponse,
  BulkEnrollmentBody, BulkEnrollmentData, BulkRemovalBody, BulkRemovalData,
} from './enrollments';
export type { ErrorResponse, HealthResponse } from './common';
export type { ValidatedLocals, ValidatedBodyField } from './validation';
export type { SessionUser, UserSession, SessionRequest, CurrentUser, SessionAccount } from './session';
export type {
  AnnouncementBody, AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery,
  AnnouncementRecord, AnnouncementResponse, AnnouncementPage,
} from './announcements';
export type {
  DashboardAnnouncement, DashboardAssessment, DashboardResource, DashboardPermissions,
  ActiveAssessmentStatistics, DashboardResponse,
} from './dashboard';
