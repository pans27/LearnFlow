import { Prisma } from '../../generated/prisma/client';
import type { ResourceRecord, StoredResourceType, ResourceCreateData, ResourceDatabaseRecord, ResourceSearchResult } from '../types';
import { HttpError } from '../errors';

// Convert database string fields to the resource domain types.
function asRecord(row: ResourceDatabaseRecord): ResourceRecord {
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
  list: async (tx: Prisma.TransactionClient, courseId: number, userId: number, instructor: boolean, resourceType?: StoredResourceType, limit?: number) =>
    (await tx.learningResource.findMany({ where: visibleResources(courseId, userId, instructor, resourceType), select: resourceSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit })).map(asRecord),

  // Load one resource when it belongs to the course and is visible to the account.
  find: async (tx: Prisma.TransactionClient, courseId: number, resourceId: number, userId: number, instructor: boolean) => {
    const row = await tx.learningResource.findFirst({ where: { id: resourceId, ...visibleResources(courseId, userId, instructor) }, select: resourceSelect });
    return row ? asRecord(row) : null;
  },

  // Store the resource row and its pending extraction job together.
  create: async (tx: Prisma.TransactionClient, courseId: number, ownerId: number, data: ResourceCreateData) => {
    const resource = asRecord(await tx.learningResource.create({ data: { courseId, ownerId, ...data, fileSizeBytes: BigInt(data.fileSizeBytes),
      mimeType: 'application/pdf', extractionStatus: 'pending' }, select: resourceSelect }));
    await tx.extractionJob.create({ data: { courseId, resourceId: resource.id } });
    return resource;
  },

  // Search extracted page text for resources this account is allowed to see.
  search: async (tx: Prisma.TransactionClient, courseId: number, userId: number, instructor: boolean, query: string): Promise<ResourceSearchResult[]> => {
    const managedHidden = instructor
      ? Prisma.sql`OR lr.resource_type IN ('instructor_material', 'assignment_file')`
      : Prisma.empty;
    const hits = await tx.$queryRaw<Array<ResourceDatabaseRecord & { pageNumber: number; snippet: string }>>`
      SELECT id, title, "resourceType", "ownerId", "isVisible", "extractionStatus", "s3Key", "originalFilename", "createdAt", "pageNumber", snippet
      FROM (
        SELECT lr.resource_id AS id, lr.title, lr.resource_type AS "resourceType", lr.owner_id AS "ownerId",
          lr.is_visible AS "isVisible", lr.extraction_status AS "extractionStatus", lr.s3_key AS "s3Key",
          lr.original_filename AS "originalFilename", lr.created_at AS "createdAt", rp.page_number AS "pageNumber",
          ts_headline('english', rp.extracted_text, websearch_to_tsquery('english', ${query}),
            'MaxWords=24, MinWords=8, MaxFragments=1, ShortWord=3') AS snippet,
          row_number() OVER (PARTITION BY lr.resource_id ORDER BY rp.page_number) AS match_rank
        FROM learnflow.resource_pages rp
        JOIN learnflow.learning_resources lr ON lr.course_id = rp.course_id AND lr.resource_id = rp.resource_id
        WHERE rp.course_id = ${courseId}
          AND rp.search_vector @@ websearch_to_tsquery('english', ${query})
          AND (lr.is_visible = TRUE OR lr.owner_id = ${userId} ${managedHidden})
      ) matches
      WHERE match_rank <= 5
      ORDER BY "createdAt" DESC, id DESC, "pageNumber" ASC
      LIMIT 250
    `;
    const grouped = new Map<number, ResourceSearchResult>();
    for (const hit of hits) {
      const snippet = hit.snippet.replaceAll('<b>', '').replaceAll('</b>', '').replaceAll('\u0000', '').trim();
      let result = grouped.get(hit.id);
      if (!result) {
        result = { resource: asRecord({ ...hit, createdAt: new Date(hit.createdAt) }), matches: [] };
        grouped.set(hit.id, result);
      }
      result.matches.push({ page: hit.pageNumber, snippet });
    }
    return [...grouped.values()];
  },

  // Delete a resource row. Pages and extraction jobs cascade with it.
  remove: async (tx: Prisma.TransactionClient, courseId: number, resourceId: number) => {
    const result = await tx.learningResource.deleteMany({ where: { id: resourceId, courseId } });
    if (result.count !== 1) throw new HttpError(404, 'Resource not found');
  },
};
