// Enrollment types use integer IDs for API bodies and database records.
export type CourseRole = 'student' | 'instructor';

export type EnrollmentBody = {
  userId?: number;
  role?: string;
};

export type EnrollmentCreateData = {
  userId: number;
  role: CourseRole;
};

export type EnrollmentUpdateData = {
  role: CourseRole;
};

export type EnrollmentRecord = {
  courseId: number;
  userId: number;
  role: string;
};

export type EnrollmentResponse = {
  courseId: number;
  userId: number;
  role: string;
};

export type BulkEnrollmentBody = {
  enrollments?: EnrollmentBody[];
};

export type BulkEnrollmentData = {
  enrollments: EnrollmentCreateData[];
};

export type BulkRemovalBody = {
  userIds?: number[];
};

export type BulkRemovalData = {
  userIds: number[];
};
