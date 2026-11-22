import type { RequestHandler } from 'express';
import type { AssignmentRecord, AssignmentResponse, AssignmentSubmissionRecord, AssignmentSubmissionResponse, ValidatedLocals } from '../types';
import { handleRequest } from '../middleware/handler';
import { requireUser } from '../middleware/current-user';
import { requireId } from '../middleware/validation';
import { readPdfUpload } from '../middleware/upload';
import { assertPdf } from '../validation/resources';
import { assignmentService as service } from '../services/assignments';
import { HttpError } from '../errors';

// Serialize assignment dates while retaining all public assignment settings.
function assignmentResponse(item: AssignmentRecord): AssignmentResponse {
  return { ...item, dueAt: item.dueAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

// Return submission ownership and timing without revealing internal object keys.
function submissionResponse(item: AssignmentSubmissionRecord): AssignmentSubmissionResponse {
  return { id: item.id, courseId: item.courseId, assignmentId: item.assignmentId, studentId: item.studentId,
    originalFilename: item.originalFilename, student: item.student, mark: item.mark, submittedAt: item.submittedAt.toISOString() };
}

// List assignments visible to the current course member.
export const list: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.list(requireId(res, 'courseId'), requireUser(res))).map(assignmentResponse));
});

// Return one assignment visible to the current course member.
export const get: RequestHandler = handleRequest(async (_req, res) => {
  res.json(assignmentResponse(await service.get(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res))));
});

// Create an assignment using validated settings and the authenticated creator.
export const create: RequestHandler = handleRequest(async (_req, res) => {
  const { assignmentData } = res.locals as ValidatedLocals;
  if (!assignmentData) throw new Error('Missing validated assignment data');
  res.status(201).json(assignmentResponse(await service.create(requireId(res, 'courseId'), requireUser(res), assignmentData)));
});

// Update an assignment using validated editable fields.
export const update: RequestHandler = handleRequest(async (_req, res) => {
  const { assignmentUpdate } = res.locals as ValidatedLocals;
  if (!assignmentUpdate) throw new Error('Missing validated assignment update');
  res.json(assignmentResponse(await service.update(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res), assignmentUpdate)));
});

// Delete an assignment without submissions and return no content.
export const remove: RequestHandler = handleRequest(async (_req, res) => {
  await service.remove(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res));
  res.status(204).end();
});

// Accept one PDF as the student's new or replacement assignment submission.
export const upload: RequestHandler = handleRequest(async (req, res) => {
  const file = await readPdfUpload(req);
  assertPdf(file.filename, file.mimeType, file.body);
  if (Object.keys(file.fields).length) throw new HttpError(400, 'Unknown body field');
  const item = await service.upload(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res), file);
  res.status(200).json(submissionResponse(item));
});

// Return the authenticated student's current submission.
export const own: RequestHandler = handleRequest(async (_req, res) => {
  res.json(submissionResponse(await service.own(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res))));
});

// List current submissions with student identities for course managers.
export const submissions: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.submissions(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireUser(res))).map(submissionResponse));
});

// Save an instructor-assigned mark and return the updated submission metadata.
export const grade: RequestHandler = handleRequest(async (_req, res) => {
  const { assignmentGrade } = res.locals as ValidatedLocals;
  if (!assignmentGrade) throw new Error('Missing validated assignment grade');
  res.json(submissionResponse(await service.grade(requireId(res, 'courseId'), requireId(res, 'assignmentId'),
    requireId(res, 'submissionId'), requireUser(res), assignmentGrade.mark)));
});

// Return an authorized short-lived download URL for the current submission file.
export const download: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.download(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireId(res, 'submissionId'), requireUser(res)));
});

// Reuse submission download authorization while signing an inline PDF URL.
export const preview: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await service.download(requireId(res, 'courseId'), requireId(res, 'assignmentId'), requireId(res, 'submissionId'), requireUser(res), false));
});
