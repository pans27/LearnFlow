import { Router } from 'express';
import { validateBody, validateIds } from '../middleware/validation';
import { createAssignmentBody, updateAssignmentBody, assignmentGradeBody } from '../validation/assignments';
import * as controller from '../controllers/assignments';

const router = Router({ mergeParams: true });
router.use(validateIds);
router.get('/', controller.list);
router.post('/', validateBody(createAssignmentBody, 'assignmentData'), controller.create);
router.get('/:assignmentId', validateIds, controller.get);
router.patch('/:assignmentId', validateIds, validateBody(updateAssignmentBody, 'assignmentUpdate'), controller.update);
router.delete('/:assignmentId', validateIds, controller.remove);
router.get('/:assignmentId/submissions', validateIds, controller.submissions);
router.post('/:assignmentId/submissions', validateIds, controller.upload);
router.get('/:assignmentId/submissions/me', validateIds, controller.own);
router.patch('/:assignmentId/submissions/:submissionId', validateIds, validateBody(assignmentGradeBody, 'assignmentGrade'), controller.grade);
router.get('/:assignmentId/submissions/:submissionId/preview', validateIds, controller.preview);
router.get('/:assignmentId/submissions/:submissionId/download', validateIds, controller.download);

export default router;
