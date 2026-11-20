import type { ResourceUploadFields } from '../types';
import { HttpError } from '../errors';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Reject anything that is not a nonempty PDF within the upload limit.
export function assertPdf(filename: string, mimeType: string, body: Buffer): void {
  if (!body.length || body.length > MAX_PDF_BYTES) throw new HttpError(400, 'Choose a nonempty PDF up to 10 MB');
  const pdfName = filename.toLowerCase().endsWith('.pdf');
  const pdfType = mimeType === 'application/pdf' || mimeType === 'application/x-pdf';
  if (!pdfName && !pdfType) throw new HttpError(400, 'Choose a PDF file');
  if (body.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Choose a PDF file');
}

// Read the multipart text fields that accompany a resource file.
export function resourceFields(fields: Record<string, string>): ResourceUploadFields {
  const allowed = ['title', 'resourceType', 'visibility'];
  if (Object.keys(fields).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unknown body field');
  const title = fields.title?.trim() ?? '';
  if (!title || title.length > 200) throw new HttpError(400, 'title must be nonempty text of at most 200 characters');
  if (fields.resourceType !== 'instructor_material' && fields.resourceType !== 'student_note') {
    throw new HttpError(400, 'Invalid resource type');
  }
  if (fields.visibility !== undefined && fields.visibility !== 'visible' && fields.visibility !== 'hidden') {
    throw new HttpError(400, 'Invalid visibility');
  }
  return { title, resourceType: fields.resourceType, isVisible: fields.visibility !== 'hidden' };
}
