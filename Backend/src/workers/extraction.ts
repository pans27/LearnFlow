import { extractionDb } from '../db/extraction';
import type { ExtractedPage, PdfProcessor, ExtractionRunResult } from '../types';

// Require ordered, consecutive page numbers and text before persisting processor output.
function validatePages(pages: ExtractedPage[]): void {
  if (!Array.isArray(pages) || pages.some((page, index) => !page || page.pageNumber !== index + 1 || typeof page.text !== 'string')) {
    throw new Error('PDF processor must return consecutive pages starting at 1 with text');
  }
}

// Process one queued PDF outside database transactions and persist its outcome.
export async function processNextExtraction(processPdf: PdfProcessor): Promise<ExtractionRunResult> {
  const work = await extractionDb.claim();
  if (!work) return 'idle';
  try {
    const pages = await processPdf(work);
    validatePages(pages);
    return await extractionDb.complete(work, pages) ? 'completed' : 'discarded';
  } catch (error) {
    console.error('PDF extraction failed:', error);
    const message = error instanceof Error ? error.message : 'PDF extraction failed';
    return await extractionDb.fail(work, message) ? 'failed' : 'discarded';
  }
}

// TODO(file processing): implement S3 PDF reading and page text extraction as a PdfProcessor.
// TODO(file processing): add leases and recovery for interrupted processing jobs.
