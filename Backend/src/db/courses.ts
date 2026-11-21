import type { Prisma } from '../../generated/prisma/client';
import type { CurrentUser, CourseState } from '../types';
import { HttpError } from '../errors';
import { getPrisma } from '../database';

const courseSelect = { id: true, name: true, courseCode: true, description: true, status: true } satisfies Prisma.CourseSelect;

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

  // Count active accounts currently enrolled as students in this course.
  eligibleStudents: (tx: Prisma.TransactionClient, courseId: number) => tx.enrollment.count({
    where: { courseId, role: 'student', user: { isActive: true } },
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
