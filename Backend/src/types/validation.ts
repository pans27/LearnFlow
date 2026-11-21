import type { CourseCreateData, CourseUpdateData, CourseStatus } from './courses';
import type { UserUpdateData, UserCreateData } from './users';
import type { EnrollmentCreateData, EnrollmentUpdateData, BulkEnrollmentData, BulkRemovalData } from './enrollments';
import type { CurrentUser } from './session';
import type { QuizData, QuizUpdateData, QuizQuestionData, QuizAnswers, QuizGradeData } from './quizzes';
import type { AssignmentCreateData, AssignmentUpdateData, AssignmentGradeData } from './assignments';
import type { AnnouncementCreateData, AnnouncementUpdateData, AnnouncementQuery } from './announcements';

// Validation middleware stores parsed values in response locals.
export type ValidatedLocals = {
  quizId?: number;
  questionId?: number;
  quizData?: QuizData;
  quizUpdate?: QuizUpdateData;
  quizQuestion?: QuizQuestionData;
  quizAnswers?: QuizAnswers;
  quizGrade?: QuizGradeData;
  assignmentId?: number;
  submissionId?: number;
  assignmentData?: AssignmentCreateData;
  assignmentUpdate?: AssignmentUpdateData;
  assignmentGrade?: AssignmentGradeData;
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
  'quizData' | 'quizUpdate' | 'quizQuestion' | 'quizAnswers' | 'quizGrade' |
  'assignmentData' | 'assignmentUpdate' | 'assignmentGrade' |
  'courseData' | 'courseUpdate' | 'userData' | 'userCreate' | 'announcementData' | 'announcementUpdate' |
  'enrollmentData' | 'enrollmentUpdate' | 'courseStatus' | 'bulkEnrollments' | 'bulkRemoval';
