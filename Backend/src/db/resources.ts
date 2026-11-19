import type { Prisma } from '../../generated/prisma/client';
import type { ResourceRecord, StoredResourceType } from '../types';
import { HttpError } from '../errors';

function asRecord(row: Omit<ResourceRecord, 'resourceType' | 'extractionStatus'> & { resourceType: string; extractionStatus: string }): ResourceRecord {
  return row as ResourceRecord;
}

const resourceSelect = {
  id: true, title: true, resourceType: true, ownerId: true, isVisible: true,
  extractionStatus: true, s3Key: true, originalFilename: true, createdAt: true,
} satisfies Prisma.LearningResourceSelect;

// Limit a course-resource query to rows this account is allowed to see.
export function visibleResources(courseId: number, userId: number, instructor: boolean, resourceType?: StoredResourceType): Prisma.LearningResourceWhereInput {
  return {
    courseId,
    ...(resourceType ? { resourceType } : {}),
    OR: [{ isVisible: true }, { ownerId: userId },
      ...(instructor ? [{ resourceType: { in: ['instructor_material', 'assignment_file'] as StoredResourceType[] } }] : [])],
  };
}

export const resourceDb = {
  // List resources in a course without exposing rows the account cannot see.
  list: async (tx: Prisma.TransactionClient, courseId: number, userId: number, instructor: boolean, resourceType?: StoredResourceType) =>
    (await tx.learningResource.findMany({ where: visibleResources(courseId, userId, instructor, resourceType), select: resourceSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map(asRecord),

  // Load one resource when it belongs to the course and is visible to the account.
  find: async (tx: Prisma.TransactionClient, courseId: number, resourceId: number, userId: number, instructor: boolean) => {
    const row = await tx.learningResource.findFirst({ where: { id: resourceId, ...visibleResources(courseId, userId, instructor) }, select: resourceSelect });
    return row ? asRecord(row) : null;
  },

  // Store the resource row and its pending extraction job together.
  create: async (tx: Prisma.TransactionClient, courseId: number, ownerId: number, data: {
    title: string; resourceType: 'instructor_material' | 'student_note'; originalFilename: string;
    fileSizeBytes: number; s3Key: string; isVisible: boolean;
  }) => {
    const resource = asRecord(await tx.learningResource.create({ data: { courseId, ownerId, ...data, fileSizeBytes: BigInt(data.fileSizeBytes),
      mimeType: 'application/pdf', extractionStatus: 'pending' }, select: resourceSelect }));
    await tx.extractionJob.create({ data: { courseId, resourceId: resource.id } });
    return resource;
  },

  // Delete a resource row. Pages and extraction jobs cascade with it.
  remove: async (tx: Prisma.TransactionClient, courseId: number, resourceId: number) => {
    const result = await tx.learningResource.deleteMany({ where: { id: resourceId, courseId } });
    if (result.count !== 1) throw new HttpError(404, 'Resource not found');
  },
};

export type { ResourceRecord };
