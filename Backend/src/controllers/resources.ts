import type { RequestHandler } from 'express';
import type { ResourceRecord, ResourceResponse } from '../types';
import { handleRequest } from '../middleware/handler';
import { requireUser } from '../middleware/current-user';
import { requireId } from '../middleware/validation';
import { readPdfUpload } from '../middleware/upload';
import { resourceService } from '../services/resources';
import { assertPdf, resourceFields } from '../validation/resources';

// Return the public resource record without its storage key internals beyond fileKey.
function resourceResponse(item: ResourceRecord): ResourceResponse {
  return { id: item.id, title: item.title, resourceType: item.resourceType, ownerId: item.ownerId,
    visibility: item.isVisible ? 'visible' : 'hidden', extractionStatus: item.extractionStatus,
    fileKey: item.s3Key, createdAt: item.createdAt.toISOString() };
}

// List course resources visible to the current account.
export const list: RequestHandler = handleRequest(async (req, res) => {
  const type = req.query.resourceType;
  if (type !== undefined && type !== 'instructor_material' && type !== 'student_note' && type !== 'assignment_file') {
    res.status(400).json({ message: 'Invalid resource type' });
    return;
  }
  const items = await resourceService.list(requireId(res, 'courseId'), requireUser(res), type);
  res.json(items.map(resourceResponse));
});

// Return one resource and its extraction status.
export const get: RequestHandler = handleRequest(async (_req, res) => {
  res.json(resourceResponse(await resourceService.get(requireId(res, 'courseId'), requireId(res, 'resourceId'), requireUser(res))));
});

// Accept a multipart PDF, store it in S3, and return the new resource.
export const upload: RequestHandler = handleRequest(async (req, res) => {
  const upload = await readPdfUpload(req);
  assertPdf(upload.filename, upload.mimeType, upload.body);
  const fields = resourceFields(upload.fields);
  const item = await resourceService.upload(requireId(res, 'courseId'), requireUser(res), upload, fields);
  res.status(201).json(resourceResponse(item));
});

// Return a short-lived URL that opens the PDF in the browser.
export const preview: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await resourceService.url(requireId(res, 'courseId'), requireId(res, 'resourceId'), requireUser(res), false));
});

// Return a short-lived URL that downloads the PDF.
export const download: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await resourceService.url(requireId(res, 'courseId'), requireId(res, 'resourceId'), requireUser(res), true));
});

// Delete the resource record and its S3 object.
export const remove: RequestHandler = handleRequest(async (_req, res) => {
  await resourceService.remove(requireId(res, 'courseId'), requireId(res, 'resourceId'), requireUser(res));
  res.status(204).end();
});
