import { getPrisma } from '../database';
import type { ExtractionJob, ExtractionWork, ExtractedPage } from '../types';

export const extractionDb = {
  // Claim the oldest eligible job without blocking other workers on busy jobs.
  claim(): Promise<ExtractionWork | null> {
    return getPrisma().$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<ExtractionJob[]>`
        UPDATE learnflow.extraction_jobs SET status = 'processing', attempts = attempts + 1,
          started_at = now(), finished_at = NULL, last_error = NULL
        WHERE job_id = (
          SELECT job_id FROM learnflow.extraction_jobs
          WHERE status IN ('pending', 'failed') AND attempts < max_attempts
          ORDER BY created_at, job_id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING job_id AS id, course_id AS "courseId", resource_id AS "resourceId", attempts
      `;
      const job = jobs[0];
      if (!job) return null;
      const resource = await tx.learningResource.update({ where: { id: job.resourceId, courseId: job.courseId },
        data: { extractionStatus: 'processing' }, select: { s3Key: true } });
      return { ...job, s3Key: resource.s3Key };
    });
  },

  // Replace extracted pages and finish the matching processing attempt atomically.
  complete(job: ExtractionJob, pages: ExtractedPage[]): Promise<boolean> {
    return getPrisma().$transaction(async (tx) => {
      const result = await tx.extractionJob.updateMany({
        where: { id: job.id, courseId: job.courseId, resourceId: job.resourceId, attempts: job.attempts, status: 'processing' },
        data: { status: 'completed', finishedAt: new Date(), lastError: null },
      });
      if (!result.count) return false;
      await tx.resourcePage.deleteMany({ where: { courseId: job.courseId, resourceId: job.resourceId } });
      if (pages.length) await tx.resourcePage.createMany({ data: pages.map((page) => ({
        courseId: job.courseId, resourceId: job.resourceId, pageNumber: page.pageNumber, extractedText: page.text,
      })) });
      await tx.learningResource.update({ where: { id: job.resourceId, courseId: job.courseId },
        data: { extractionStatus: 'completed', pageCount: pages.length } });
      return true;
    });
  },

  // Mark a matching attempt failed while retaining its error for bounded retries.
  fail(job: ExtractionJob, message: string): Promise<boolean> {
    return getPrisma().$transaction(async (tx) => {
      const result = await tx.extractionJob.updateMany({
        where: { id: job.id, courseId: job.courseId, resourceId: job.resourceId, attempts: job.attempts, status: 'processing' },
        data: { status: 'failed', finishedAt: new Date(), lastError: message.slice(0, 2000) },
      });
      if (!result.count) return false;
      await tx.learningResource.update({ where: { id: job.resourceId, courseId: job.courseId }, data: { extractionStatus: 'failed' } });
      return true;
    });
  },
};
