import { Router } from 'express';
import { requireAdmin } from '../middleware/admin';
import { validateIds, validateBody } from '../middleware/validation';
import * as controller from '../controllers/admin';
import * as validation from '../validation/admin';

const router = Router();
// TODO(auth owner): replace the pass-through admin filter with authorization.
router.use(requireAdmin);

router.get('/users', controller.listUsers);
router.post('/users', controller.provisionUser);
router.get('/users/:userId', validateIds, controller.getUser);
router.patch('/users/:userId', validateIds, validateBody(validation.userBody, 'userData'), controller.updateUser);
router.get('/courses', controller.listCourses);
router.post('/courses', validateBody((body) => validation.courseBody(body), 'courseData'), controller.createCourse);
router.patch('/courses/:courseId', validateIds, validateBody((body) => validation.courseBody(body, true), 'courseUpdate'), controller.updateCourse);
router.patch('/courses/:courseId/status', validateIds, validateBody(validation.statusBody, 'courseStatus'), controller.setCourseStatus);
router.get('/courses/:courseId/enrollments', validateIds, controller.listEnrollments);
router.post('/courses/:courseId/enrollments/bulk', validateIds,
  validateBody(validation.bulkEnrollmentBody, 'bulkEnrollments'), controller.createEnrollments);
router.post('/courses/:courseId/enrollments/bulk-remove', validateIds,
  validateBody(validation.bulkRemovalBody, 'bulkRemoval'), controller.removeEnrollments);
router.post('/courses/:courseId/enrollments', validateIds,
  validateBody((body) => validation.enrollmentBody(body, true), 'enrollmentData'), controller.createEnrollment);
router.patch('/courses/:courseId/enrollments/:userId', validateIds,
  validateBody((body) => validation.enrollmentBody(body), 'enrollmentUpdate'), controller.updateEnrollment);
router.delete('/courses/:courseId/enrollments/:userId', validateIds, controller.removeEnrollment);

export default router;
