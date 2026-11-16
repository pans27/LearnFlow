import { Router } from 'express';
import { requireCurrentUser } from '../middleware/current-user';
import { validateIds } from '../middleware/validation';
import * as controller from '../controllers/courses';

const router = Router();
router.use(requireCurrentUser);
router.get('/', controller.listCourses);
router.get('/:courseId', validateIds, controller.getCourse);
router.get('/:courseId/dashboard', validateIds, controller.getDashboard);

export default router;
