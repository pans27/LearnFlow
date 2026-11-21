import { Router } from 'express';
import { validateBody, validateIds } from '../middleware/validation';
import { createQuizBody, updateQuizBody, quizQuestionBody, quizAnswersBody, quizGradeBody } from '../validation/quizzes';
import * as controller from '../controllers/quizzes';

const router = Router({ mergeParams: true });
router.use(validateIds);
router.get('/', controller.list);
router.post('/', validateBody(createQuizBody, 'quizData'), controller.create);
router.get('/:quizId', validateIds, controller.get);
router.patch('/:quizId', validateIds, validateBody(updateQuizBody, 'quizUpdate'), controller.update);
router.delete('/:quizId', validateIds, controller.remove);
router.get('/:quizId/questions', validateIds, controller.questions);
router.post('/:quizId/questions', validateIds, validateBody(quizQuestionBody, 'quizQuestion'), controller.createQuestion);
router.patch('/:quizId/questions/:questionId', validateIds, validateBody(quizQuestionBody, 'quizQuestion'), controller.updateQuestion);
router.delete('/:quizId/questions/:questionId', validateIds, controller.removeQuestion);
router.get('/:quizId/draft', validateIds, controller.getDraft);
router.put('/:quizId/draft', validateIds, validateBody(quizAnswersBody, 'quizAnswers'), controller.saveDraft);
router.get('/:quizId/statistics', validateIds, controller.statistics);
router.get('/:quizId/submissions', validateIds, controller.submissions);
router.post('/:quizId/submissions', validateIds, validateBody(quizAnswersBody, 'quizAnswers'), controller.submit);
router.get('/:quizId/submissions/me', validateIds, controller.own);
router.get('/:quizId/submissions/:submissionId', validateIds, controller.submission);
router.patch('/:quizId/submissions/:submissionId', validateIds, validateBody(quizAnswersBody, 'quizAnswers'), controller.saveDraft);
router.post('/:quizId/submissions/:submissionId/submit', validateIds, validateBody(quizAnswersBody, 'quizAnswers'), controller.submit);
router.get('/:quizId/submissions/:submissionId/result', validateIds, controller.result);
router.patch('/:quizId/submissions/:submissionId/grade', validateIds, validateBody(quizGradeBody, 'quizGrade'), controller.grade);

export default router;
