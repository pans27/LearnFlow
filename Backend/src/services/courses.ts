import { MAX_DASHBOARD_ANNOUNCEMENTS, MAX_DASHBOARD_ASSESSMENTS, MAX_DASHBOARD_RESOURCES } from '../constants/dashboard';
import type { Prisma } from '../../generated/prisma/client';
import type { AccessibleCourseResponse, CourseAccessRecord, CurrentUser, DashboardAssessment, DashboardResponse } from '../types';
import { courseDb as database } from '../db/courses';
import { HttpError } from '../errors';

// Return course metadata and the current user's course-specific role.
function courseResponse(course: CourseAccessRecord): AccessibleCourseResponse {
  const role = course.enrollments[0]?.role;
  return { id: course.id, name: course.name, courseCode: course.courseCode,
    description: course.description, status: course.status,
    role: role === 'student' || role === 'instructor' ? role : null };
}

// Require membership for regular users and reserve archived courses for administrators.
async function accessibleCourse(tx: Prisma.TransactionClient, courseId: number, user: CurrentUser): Promise<AccessibleCourseResponse> {
  const course = await database.find(tx, courseId, user.id);
  if (!course) throw new HttpError(404, 'Course not found');
  if (!user.isAdmin && (course.status !== 'active' || !course.enrollments.length)) {
    throw new HttpError(403, 'Forbidden');
  }
  return courseResponse(course);
}

export const courseService = {
  // List courses accessible to the current session user.
  list(user: CurrentUser) {
    return database.read(async (tx) => (await database.list(tx, user)).map(courseResponse));
  },

  // Return one course after checking the current user's access.
  get(courseId: number, user: CurrentUser) {
    return database.read((tx) => accessibleCourse(tx, courseId, user));
  },

  // Build a role-aware course dashboard without exposing answer keys or private file data.
  dashboard(courseId: number, user: CurrentUser): Promise<DashboardResponse> {
    return database.read(async (tx) => {
      const course = await accessibleCourse(tx, courseId, user);
      const instructor = user.isAdmin || course.role === 'instructor';
      const readOnly = course.status === 'archived';
      const canManage = instructor && !readOnly;
      const now = new Date();
      const [announcements, assignments, quizzes, resources] = await Promise.all([
        database.announcements(tx, courseId, instructor), database.assignments(tx, courseId, instructor, now),
        database.quizzes(tx, courseId, instructor, now), database.resources(tx, courseId, user.id, instructor),
      ]);
      const assessments: DashboardAssessment[] = [
        ...assignments.map((item): DashboardAssessment => ({ id: item.id, type: 'assignment', title: item.title,
          dueAt: item.dueAt!.toISOString(), opensAt: null, isVisible: item.isVisible, status: null })),
        ...quizzes.map((item): DashboardAssessment => ({ id: item.id, type: 'quiz', title: item.title,
          dueAt: item.dueAt!.toISOString(), opensAt: item.opensAt?.toISOString() ?? null, isVisible: item.isVisible, status: item.status })),
      ].sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.type.localeCompare(b.type) || a.id - b.id).slice(0, MAX_DASHBOARD_ASSESSMENTS);
      const response: DashboardResponse = {
        course, view: instructor ? 'instructor' : 'student', readOnly,
        permissions: { canPublishAnnouncements: canManage, canCreateAssessments: canManage,
          canManageResources: canManage, canReviewSubmissions: canManage },
        recentAnnouncements: announcements.slice(0, MAX_DASHBOARD_ANNOUNCEMENTS)
          .map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        upcomingAssessments: assessments,
        recentResources: resources.slice(0, MAX_DASHBOARD_RESOURCES)
          .map((item) => ({ id: item.id, title: item.title, resourceType: item.resourceType,
          ownerId: item.ownerId, visibility: item.isVisible ? 'visible' : 'hidden',
          extractionStatus: item.extractionStatus, createdAt: item.createdAt.toISOString() })),
      };
      if (!instructor) {
        const [quizSubmissions, assignmentSubmissions] = await Promise.all([
          database.ownQuizSubmissions(tx, courseId, user.id, assessments.filter((a) => a.type === 'quiz').map((a) => a.id)),
          database.ownAssignmentSubmissions(tx, courseId, user.id, assessments.filter((a) => a.type === 'assignment').map((a) => a.id)),
        ]);
        for (const assessment of assessments) {
          assessment.submissionStatus = assessment.type === 'quiz'
            ? quizSubmissions.find((submission) => submission.quizId === assessment.id)?.status ?? 'not_started'
            : assignmentSubmissions.some((submission) => submission.assignmentId === assessment.id) ? 'submitted' : 'not_started';
        }
      } else {
        const [activeQuizzes, activeAssignments, eligibleStudents] = await Promise.all([
          database.activeQuizzes(tx, courseId, now), database.activeAssignments(tx, courseId, now), database.eligibleStudents(tx, courseId),
        ]);
        const [quizStates, assignmentStates] = await Promise.all([
          database.submissionStates(tx, courseId, activeQuizzes.map((quiz) => quiz.id)),
          database.assignmentSubmissionStates(tx, courseId, activeAssignments.map((assignment) => assignment.id)),
        ]);
        const active = [
          ...activeQuizzes.map((item) => ({ ...item, type: 'quiz' as const })),
          ...activeAssignments.map((item) => ({ ...item, type: 'assignment' as const })),
        ].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity)
          || a.type.localeCompare(b.type) || a.id - b.id).slice(0, MAX_DASHBOARD_ASSESSMENTS);
        response.activeAssessmentStatistics = active.map((assessment) => {
          const states = assessment.type === 'quiz'
            ? quizStates.filter((submission) => submission.quizId === assessment.id)
            : assignmentStates.filter((submission) => submission.assignmentId === assessment.id);
          const submittedCount = new Set(states.map((submission) => submission.studentId)).size;
          const gradedCount = assessment.type === 'quiz' ? new Set(quizStates
            .filter((submission) => submission.quizId === assessment.id && submission.status === 'graded')
            .map((submission) => submission.studentId)).size : null;
          return { assessmentId: assessment.id, type: assessment.type, title: assessment.title, eligibleStudents, submittedCount, gradedCount,
            submissionRate: eligibleStudents ? submittedCount / eligibleStudents : 0 };
        });
      }
      return response;
    });
  },
};
