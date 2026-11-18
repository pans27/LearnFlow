import { MAX_DASHBOARD_ANNOUNCEMENTS, MAX_DASHBOARD_ASSESSMENTS, MAX_DASHBOARD_RESOURCES } from '../constants/dashboard';
import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, CourseState } from '../types';
import { HttpError } from '../errors';
import { getPrisma } from '../database';

const courseSelect = { id: true, name: true, courseCode: true, description: true, status: true } satisfies Prisma.CourseSelect;
const recentOrder = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.AnnouncementOrderByWithRelationInput[];
const dueOrder = [{ dueAt: 'asc' }, { id: 'asc' }] satisfies Prisma.QuizOrderByWithRelationInput[];

export const courseDb = {
  // Read course access and dashboard data from one consistent database snapshot.
  read: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
    getPrisma().$transaction(operation, { isolationLevel: 'RepeatableRead' }),

  // List only enrolled courses while keeping archived courses restricted to administrators.
  list: (tx: Prisma.TransactionClient, user: CurrentUser) => tx.course.findMany({
    where: { enrollments: { some: { userId: user.id } }, ...(user.isAdmin ? {} : { status: 'active' }) },
    select: { ...courseSelect, enrollments: { where: { userId: user.id }, select: { role: true } } },
    orderBy: [{ courseCode: 'asc' }, { id: 'asc' }],
  }),

  // Fetch a course and only the requesting user's membership.
  find: (tx: Prisma.TransactionClient, courseId: number, userId: number) => tx.course.findUnique({
    where: { id: courseId },
    select: { ...courseSelect, enrollments: { where: { userId }, select: { role: true } } },
  }),

  // Fetch the latest announcements within the dashboard limit permitted for the current dashboard view.
  announcements: (tx: Prisma.TransactionClient, courseId: number, instructor: boolean) => tx.announcement.findMany({
    where: { courseId, ...(instructor ? {} : { isVisible: true }) },
    select: { id: true, title: true, body: true, isVisible: true, createdAt: true },
    orderBy: recentOrder, take: MAX_DASHBOARD_ANNOUNCEMENTS,
  }),

  // Fetch upcoming assignments within the dashboard limit.
  assignments: (tx: Prisma.TransactionClient, courseId: number, instructor: boolean, now: Date) => tx.assignment.findMany({
    where: { courseId, dueAt: { gte: now }, ...(instructor ? {} : { isVisible: true }) },
    select: { id: true, title: true, dueAt: true, isVisible: true },
    orderBy: dueOrder, take: MAX_DASHBOARD_ASSESSMENTS,
  }),

  // Fetch upcoming quizzes while excluding hidden or unpublished quizzes for students.
  quizzes: (tx: Prisma.TransactionClient, courseId: number, instructor: boolean, now: Date) => tx.quiz.findMany({
    where: { courseId, dueAt: { gte: now }, ...(instructor ? { status: { not: 'closed' } } : { isVisible: true, status: 'published' }) },
    select: { id: true, title: true, dueAt: true, opensAt: true, isVisible: true, status: true },
    orderBy: dueOrder, take: MAX_DASHBOARD_ASSESSMENTS,
  }),

  // Fetch recent visible resources, the user's private resources, and instructor-managed materials.
  resources: (tx: Prisma.TransactionClient, courseId: number, userId: number, instructor: boolean) => tx.learningResource.findMany({
    where: { courseId, OR: [{ isVisible: true }, { ownerId: userId },
      ...(instructor ? [{ resourceType: { in: ['instructor_material', 'assignment_file'] } }] : [])] },
    select: { id: true, title: true, resourceType: true, ownerId: true, isVisible: true, extractionStatus: true, createdAt: true },
    orderBy: recentOrder, take: MAX_DASHBOARD_RESOURCES,
  }),

  // Fetch only the student's latest attempt status for each upcoming quiz.
  ownQuizSubmissions: (tx: Prisma.TransactionClient, courseId: number, userId: number, quizIds: number[]) => tx.submission.findMany({
    where: { courseId, studentId: userId, quizId: { in: quizIds } },
    select: { quizId: true, status: true }, distinct: ['quizId'], orderBy: { attemptNumber: 'desc' },
  }),

  // Fetch the student's submitted assignment IDs without exposing storage keys.
  ownAssignmentSubmissions: (tx: Prisma.TransactionClient, courseId: number, userId: number, assignmentIds: number[]) =>
    tx.assignmentSubmission.findMany({ where: { courseId, studentId: userId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true } }),

  // Fetch open, visible, published quizzes within the dashboard statistics limit.
  activeQuizzes: (tx: Prisma.TransactionClient, courseId: number, now: Date) => tx.quiz.findMany({
    where: { courseId, status: 'published', isVisible: true,
      AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
        { OR: [{ dueAt: null }, { dueAt: { gte: now } }] }] },
    select: { id: true, title: true, dueAt: true }, orderBy: dueOrder, take: MAX_DASHBOARD_ASSESSMENTS,
  }),

  // Fetch visible assignments within the dashboard statistics limit.
  activeAssignments: (tx: Prisma.TransactionClient, courseId: number, now: Date) => tx.assignment.findMany({
    where: { courseId, isVisible: true, OR: [{ dueAt: null }, { dueAt: { gte: now } }] },
    select: { id: true, title: true, dueAt: true }, orderBy: dueOrder, take: MAX_DASHBOARD_ASSESSMENTS,
  }),

  // Fetch submitted assignment memberships for currently enrolled active students.
  assignmentSubmissionStates: (tx: Prisma.TransactionClient, courseId: number, assignmentIds: number[]) =>
    tx.assignmentSubmission.findMany({
      where: { courseId, assignmentId: { in: assignmentIds },
        student: { isActive: true, enrollments: { some: { courseId, role: 'student' } } } },
      select: { assignmentId: true, studentId: true },
    }),

  // Count active accounts currently enrolled as students in this course.
  eligibleStudents: (tx: Prisma.TransactionClient, courseId: number) => tx.enrollment.count({
    where: { courseId, role: 'student', user: { isActive: true } },
  }),

  // Fetch distinct student submission states while excluding drafts and former course members.
  submissionStates: (tx: Prisma.TransactionClient, courseId: number, quizIds: number[]) => tx.submission.findMany({
    where: { courseId, quizId: { in: quizIds }, status: { in: ['submitted', 'graded'] },
      student: { isActive: true, enrollments: { some: { courseId, role: 'student' } } } },
    select: { quizId: true, studentId: true, status: true }, distinct: ['quizId', 'studentId', 'status'],
  }),
};

// Check course existence and run related operations in one transaction.
export function withCourseTransaction<T>(courseId: number, operation: (tx: Prisma.TransactionClient, course: CourseState) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true, status: true } });
    if (!course) throw new HttpError(404, 'Course not found');
    return operation(tx, course);
  });
}
