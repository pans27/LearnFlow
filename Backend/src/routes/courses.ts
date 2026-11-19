import { Router } from 'express';
import { requireCurrentUser } from '../middleware/current-user';
import { validateIds } from '../middleware/validation';
import * as controller from '../controllers/courses';
import announcementRoutes from './announcements';
import resourceRoutes from './resources';

const router = Router();
router.use(requireCurrentUser);
router.use('/:courseId/announcements', announcementRoutes);
router.use('/:courseId/resources', resourceRoutes);
router.get('/', controller.listCourses);
router.get('/:courseId', validateIds, controller.getCourse);
router.get('/:courseId/dashboard', validateIds, controller.getDashboard);

export default router;
