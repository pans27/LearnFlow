import { Router } from 'express';
import { requireUser } from '../middleware/current-user';
import { requireCurrentUser } from '../middleware/current-user';
import { validateIds } from '../middleware/validation';
import * as controller from '../controllers/courses';
import announcementRoutes from './announcements';
import resourceRoutes from './resources';
import assignmentRoutes from './assignments';
import quizRoutes from './quizzes';

const router = Router();
router.use(requireCurrentUser);
// Administrators may inspect courses but cannot modify teaching content or submit work.
router.use((req, res, next) => {
  if (requireUser(res).isAdmin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.status(403).json({ message: 'Administrator course access is read-only. Use a separate instructor or student account.' });
    return;
  }
  next();
});
router.use('/:courseId/announcements', announcementRoutes);
router.use('/:courseId/resources', resourceRoutes);
router.use('/:courseId/assignments', assignmentRoutes);
router.use('/:courseId/quizzes', quizRoutes);
router.get('/', controller.listCourses);
router.get('/:courseId', validateIds, controller.getCourse);
router.get('/:courseId/dashboard', validateIds, controller.getDashboard);

export default router;
