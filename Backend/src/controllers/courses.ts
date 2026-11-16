import type { RequestHandler } from 'express';
import { courseService } from '../services/courses';
import { handleRequest } from '../middleware/handler';
import { requireUser } from '../middleware/current-user';
import { requireId } from '../middleware/validation';

// Return the current user's accessible courses and membership roles.
export const listCourses: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await courseService.list(requireUser(res)));
});

// Return a course after checking access for the current session user.
export const getCourse: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await courseService.get(requireId(res, 'courseId'), requireUser(res)));
});

// Return recent course activity and role-specific dashboard information.
export const getDashboard: RequestHandler = handleRequest(async (_req, res) => {
  res.json(await courseService.dashboard(requireId(res, 'courseId'), requireUser(res)));
});
