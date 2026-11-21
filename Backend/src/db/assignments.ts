import { Prisma } from '../../generated/prisma/client';
import { getPrisma } from '../database';
import { HttpError } from '../errors';
import type { AssignmentCreateData, AssignmentUpdateData, AssignmentSubmissionData, AssignmentListOptions } from '../types';

const student = { select: { id: true, name: true, email: true } };

export const assignmentDb = {
  // Run related assignment checks and writes atomically without locking a course.
  write: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => getPrisma().$transaction(operation),

  // List visible assignments with optional deadline filtering and database limits for dashboards.
  list: (tx: Prisma.TransactionClient, courseId: number, manage: boolean, options: AssignmentListOptions = {}) => tx.assignment.findMany({
    where: { courseId, ...(manage ? {} : { isVisible: true }),
      ...(options.dueAfter ? { OR: [{ dueAt: { gte: options.dueAfter } }, ...(options.includeUndated ? [{ dueAt: null }] : [])] } : {}) },
    orderBy: options.dueAfter ? [{ dueAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit,
  }),

  // Fetch only the current student's submission states for the requested assignments.
  ownSubmissionStates: (tx: Prisma.TransactionClient, courseId: number, userId: number, assignmentIds: number[]) =>
    tx.assignmentSubmission.findMany({ where: { courseId, studentId: userId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true } }),

  // Fetch submitted memberships for currently enrolled active students without private file fields.
  submissionStates: (tx: Prisma.TransactionClient, courseId: number, assignmentIds: number[]) =>
    tx.assignmentSubmission.findMany({
      where: { courseId, assignmentId: { in: assignmentIds },
        student: { isActive: true, enrollments: { some: { courseId, role: 'student' } } } },
      select: { assignmentId: true, studentId: true },
    }),

  // Load one assignment within its course.
  find: (tx: Prisma.TransactionClient, courseId: number, id: number) => tx.assignment.findFirst({ where: { courseId, id } }),

  // Create an assignment attributed to the authenticated instructor or administrator.
  create: async (tx: Prisma.TransactionClient, courseId: number, createdBy: number, data: AssignmentCreateData) => {
    try { return await tx.assignment.create({ data: { courseId, createdBy, ...data } }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new HttpError(409, 'Course or creator is no longer available');
      throw error;
    }
  },

  // Update an existing assignment and translate concurrent deletion into a missing record.
  update: async (tx: Prisma.TransactionClient, courseId: number, id: number, data: AssignmentUpdateData) => {
    try { return await tx.assignment.update({ where: { id, courseId }, data }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new HttpError(404, 'Assignment not found');
      throw error;
    }
  },

  // Keep submitted work intact by deleting only assignments without submissions.
  remove: async (tx: Prisma.TransactionClient, courseId: number, id: number) => {
    await tx.$queryRaw`SELECT assignment_id FROM learnflow.assignments WHERE assignment_id = ${id} AND course_id = ${courseId} FOR UPDATE`;
    if (await tx.assignmentSubmission.count({ where: { courseId, assignmentId: id } })) throw new HttpError(409, 'Assignments with submissions cannot be deleted');
    const result = await tx.assignment.deleteMany({ where: { courseId, id } });
    if (!result.count) throw new HttpError(404, 'Assignment not found');
  },

  // Serialize uploads for one student and assignment to enforce replacement permission.
  lockSubmission: async (tx: Prisma.TransactionClient, assignmentId: number, studentId: number) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${assignmentId}::integer, ${studentId}::integer)::text`;
  },

  // Return the current submission for one student with public student identity.
  own: (tx: Prisma.TransactionClient, courseId: number, assignmentId: number, studentId: number) =>
    tx.assignmentSubmission.findUnique({ where: { courseId_assignmentId_studentId: { courseId, assignmentId, studentId } }, include: { student } }),

  // List one current submission per student with their name and email.
  submissions: (tx: Prisma.TransactionClient, courseId: number, assignmentId: number) => tx.assignmentSubmission.findMany({
    where: { courseId, assignmentId }, include: { student }, orderBy: [{ studentId: 'asc' }],
  }),

  // Find a submission only within the requested assignment and course.
  submission: (tx: Prisma.TransactionClient, courseId: number, assignmentId: number, id: number) =>
    tx.assignmentSubmission.findFirst({ where: { courseId, assignmentId, id }, include: { student } }),

  // Insert or replace a student's current file while retaining its submission identifier.
  saveSubmission: async (tx: Prisma.TransactionClient, courseId: number, assignmentId: number, studentId: number, data: AssignmentSubmissionData) => {
    try {
      return await tx.assignmentSubmission.upsert({ where: { courseId_assignmentId_studentId: { courseId, assignmentId, studentId } },
        create: { courseId, assignmentId, studentId, ...data }, update: { ...data, submittedAt: new Date() }, include: { student } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new HttpError(409, 'Assignment or student is no longer available');
      throw error;
    }
  },
};
