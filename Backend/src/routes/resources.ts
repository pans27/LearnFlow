import { Router } from 'express';
import { validateIds } from '../middleware/validation';
import * as controller from '../controllers/resources';

const router = Router({ mergeParams: true });

router.use(validateIds);
router.get('/', controller.list);
router.get('/search', controller.search);
router.post('/', controller.upload);
router.get('/:resourceId/preview', validateIds, controller.preview);
router.get('/:resourceId/download', validateIds, controller.download);
router.get('/:resourceId', validateIds, controller.get);
router.delete('/:resourceId', validateIds, controller.remove);

export default router;
