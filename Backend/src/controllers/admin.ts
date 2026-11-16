import type { RequestHandler } from 'express';
import type {
  CourseRecord, PublicUserRecord, EnrollmentRecord,
  CourseResponse, UserResponse, EnrollmentResponse, ValidatedLocals,
} from '../types';
import { adminService as service } from '../services/admin';
import { HttpError } from '../errors';
import { handleRequest } from '../middleware/handler';
import { requireId } from '../middleware/validation';

// Convert a course record into its public API response.
function courseResponse(course: CourseRecord): CourseResponse {
  return { id: course.id, name: course.name, status: course.status,
    courseCode: course.courseCode, description: course.description };
}

// Serialize public user fields with a string ID.
function userResponse(user: PublicUserRecord): UserResponse {
  return { id: user.id, name: user.name, email: user.email,
    isAdmin: user.isAdmin, mustChangePassword: user.mustChangePassword };
}

// Serialize enrollment IDs and the course role.
function enrollmentResponse(enrollment: EnrollmentRecord): EnrollmentResponse {
  return { courseId: enrollment.courseId, userId: enrollment.userId, role: enrollment.role };
}

// Return the list of user records.
export const listUsers: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.listUsers()).map(userResponse));
});

// Return the requested user record.
export const getUser: RequestHandler = handleRequest(async (_req, res) => {
  res.json(userResponse(await service.getUser(requireId(res, 'userId'))));
});

// Return the user after applying validated changes.
export const updateUser: RequestHandler = handleRequest(async (_req, res) => {
  const { userData } = res.locals as ValidatedLocals;
  if (!userData) throw new Error('Missing validated user data');
  res.json(userResponse(await service.updateUser(requireId(res, 'userId'), userData)));
});

// Reject user creation until authentication integration is implemented.
export const provisionUser: RequestHandler = handleRequest(() => {
  // TODO(auth owner): generate and hash a temporary password without accepting caller-supplied passwords.
  // Return it once with Cache-Control: no-store and persist mustChangePassword=true.
  throw new HttpError(501, 'User provisioning awaits authentication integration');
});

// Return active and archived courses.
export const listCourses: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.listCourses()).map(courseResponse));
});

// Create a course and return HTTP 201.
export const createCourse: RequestHandler = handleRequest(async (_req, res) => {
  const { courseData } = res.locals as ValidatedLocals;
  if (!courseData) throw new Error('Missing validated course data');
  const course = await service.createCourse(courseData);
  res.status(201).json(courseResponse(course));
});

// Add memberships in bulk and return the created enrollment objects.
export const createEnrollments: RequestHandler = handleRequest(async (_req, res) => {
  const { bulkEnrollments } = res.locals as ValidatedLocals;
  if (!bulkEnrollments) throw new Error('Missing validated enrollment batch');
  const enrollments = await service.createEnrollments(requireId(res, 'courseId'), bulkEnrollments);
  res.status(201).json(enrollments.map(enrollmentResponse));
});

// Remove memberships in bulk and return HTTP 204.
export const removeEnrollments: RequestHandler = handleRequest(async (_req, res) => {
  const { bulkRemoval } = res.locals as ValidatedLocals;
  if (!bulkRemoval) throw new Error('Missing validated removal batch');
  await service.removeEnrollments(requireId(res, 'courseId'), bulkRemoval);
  res.sendStatus(204);
});

// Return the course after updating its metadata.
export const updateCourse: RequestHandler = handleRequest(async (_req, res) => {
  const { courseUpdate } = res.locals as ValidatedLocals;
  if (!courseUpdate) throw new Error('Missing validated course update');
  res.json(courseResponse(await service.updateCourse(requireId(res, 'courseId'), courseUpdate)));
});

// Return the course after archiving or reactivating it.
export const setCourseStatus: RequestHandler = handleRequest(async (_req, res) => {
  const { courseStatus } = res.locals as ValidatedLocals;
  if (!courseStatus) throw new Error('Missing validated course status');
  res.json(courseResponse(await service.setCourseStatus(requireId(res, 'courseId'), courseStatus)));
});

// Return the memberships for the requested course.
export const listEnrollments: RequestHandler = handleRequest(async (_req, res) => {
  res.json((await service.listEnrollments(requireId(res, 'courseId'))).map(enrollmentResponse));
});

// Create a course membership and return HTTP 201.
export const createEnrollment: RequestHandler = handleRequest(async (_req, res) => {
  const { enrollmentData } = res.locals as ValidatedLocals;
  if (!enrollmentData) throw new Error('Missing validated enrollment data');
  res.status(201).json(enrollmentResponse(await service.createEnrollment(
    requireId(res, 'courseId'), enrollmentData.userId, enrollmentData.role,
  )));
});

// Return the membership after changing its role.
export const updateEnrollment: RequestHandler = handleRequest(async (_req, res) => {
  const { enrollmentUpdate } = res.locals as ValidatedLocals;
  if (!enrollmentUpdate) throw new Error('Missing validated enrollment update');
  res.json(enrollmentResponse(await service.updateEnrollment(
    requireId(res, 'courseId'), requireId(res, 'userId'), enrollmentUpdate.role,
  )));
});

// Remove the membership and return HTTP 204.
export const removeEnrollment: RequestHandler = handleRequest(async (_req, res) => {
  await service.removeEnrollment(requireId(res, 'courseId'), requireId(res, 'userId'));
  res.sendStatus(204);
});
