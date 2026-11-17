import type { CourseInsertData, CourseSaveData, UserUpdateData, UserCreateData, CourseRole, LockedCourse, CourseLockRow, EnrollmentCreateData } from '../types';
import { Prisma } from '../../generated/prisma/client';
import { getPrisma } from '../database';
import { HttpError } from '../errors';

export const publicUserSelect = {
  id: true, name: true, email: true, isAdmin: true, mustChangePassword: true,
} satisfies Prisma.UserSelect;

export const adminDb = {

  // Insert a provisioned account and handle case-insensitive email conflicts locally.
  createUser: async (data: UserCreateData, passwordHash: string) => {
    try {
      return await getPrisma().user.create({ data: { ...data, passwordHash, isActive: true, mustChangePassword: true },
        select: publicUserSelect });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'A user with this email already exists');
      }
      throw error;
    }
  },

  // Fetch account flags for every user in a membership batch.
  findAccounts: (tx: Prisma.TransactionClient, userIds: number[]) =>
    tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, isActive: true } }),

  // Insert all memberships or reject the entire conflicting batch.
  createEnrollments: async (tx: Prisma.TransactionClient, courseId: number, entries: EnrollmentCreateData[]) => {
    try {
      return await tx.enrollment.createManyAndReturn({ data: entries.map((entry) => ({ courseId, ...entry })) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new HttpError(409, 'A user in the batch is already enrolled in this course');
        if (error.code === 'P2003') throw new HttpError(409, 'Course or user is no longer available');
      }
      throw error;
    }
  },

  // Remove every requested membership or roll back if any membership is missing.
  removeEnrollments: async (tx: Prisma.TransactionClient, courseId: number, userIds: number[]) => {
    const result = await tx.enrollment.deleteMany({ where: { courseId, userId: { in: userIds } } });
    if (result.count !== userIds.length) throw new HttpError(404, 'A course enrollment in the batch was not found');
  },

  // Fetch public user fields ordered by ID.
  listUsers: () => getPrisma().user.findMany({ select: publicUserSelect, orderBy: { id: 'asc' } }),
  
  // Fetch one user without exposing its password hash.
  findUser: (id: number) => getPrisma().user.findUnique({ where: { id }, select: publicUserSelect }),
 
  // Fetch all courses ordered by ID.
  listCourses: () => getPrisma().course.findMany({ orderBy: { id: 'asc' } }),
  
  // Insert a course record.
  createCourse: (data: CourseInsertData) =>
    getPrisma().course.create({ data }),
  
  // Update course fields inside the supplied transaction.
  updateCourse: (tx: Prisma.TransactionClient, id: number,
    data: CourseSaveData) =>
    tx.course.update({ where: { id }, data }),
  
  // Fetch course memberships ordered by user ID.
  listEnrollments: (tx: Prisma.TransactionClient, courseId: number) =>
    tx.enrollment.findMany({ where: { courseId }, orderBy: { userId: 'asc' } }),
  
  // Fetch the account activation flag inside the transaction.
  findActiveAccount: (tx: Prisma.TransactionClient, id: number) =>
    tx.user.findUnique({ where: { id }, select: { isActive: true } }),
  
  // Insert a course membership inside the transaction.
  createEnrollment: async (tx: Prisma.TransactionClient, courseId: number, userId: number, role: CourseRole) => {
    try {
      return await tx.enrollment.create({ data: { courseId, userId, role } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new HttpError(409, 'User is already enrolled in this course');
        if (error.code === 'P2003') throw new HttpError(409, 'Course or user is no longer available');
      }
      throw error;
    }
  },
  
  // Update the role of one course membership.
  updateEnrollment: async (tx: Prisma.TransactionClient, courseId: number, userId: number, role: CourseRole) => {
    try {
      return await tx.enrollment.update({ where: { courseId_userId: { courseId, userId } }, data: { role } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Enrollment not found');
      }
      throw error;
    }
  },
  
  // Delete only the specified course membership.
  removeEnrollment: async (tx: Prisma.TransactionClient, courseId: number, userId: number) => {
    try {
      return await tx.enrollment.delete({ where: { courseId_userId: { courseId, userId } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new HttpError(404, 'Enrollment not found');
      }
      throw error;
    }
  },
  
  // Fetch account flags needed to validate an administrator update.
  findUserForUpdate: (tx: Prisma.TransactionClient, id: number) =>
    tx.user.findUnique({ where: { id }, select: { id: true, isAdmin: true, isActive: true } }),
  
  // Count active administrator accounts inside the transaction.
  countActiveAdmins: (tx: Prisma.TransactionClient) =>
    tx.user.count({ where: { isAdmin: true, isActive: true } }),
  
  // Update user fields and return only public fields.
  updateUser: (tx: Prisma.TransactionClient, id: number, data: UserUpdateData) =>
    tx.user.update({ where: { id }, data, select: publicUserSelect }),

  
  // Run an operation while holding a transaction lock on its course.
  withCourse: <T>(id: number, operation: (tx: Prisma.TransactionClient, course: LockedCourse) => Promise<T>) => getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CourseLockRow[]>`
      SELECT course_id, status FROM learnflow.courses WHERE course_id = ${id} FOR UPDATE
    `;
    if (!rows[0]) throw new HttpError(404, 'Course not found');
    return operation(tx, { id: rows[0].course_id, status: rows[0].status });
  }),

  // Serialize administrator updates using a transaction advisory lock.
  withAdminLock: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
    getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(1724001)::text`;
      return operation(tx);
    }),
};
