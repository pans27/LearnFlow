import { Router } from 'express';
import { validateBody, validateIds } from '../middleware/validation';
import { createAnnouncementBody, updateAnnouncementBody, validateAnnouncementQuery } from '../validation/announcements';
import * as controller from '../controllers/announcements';

const router = Router({ mergeParams: true });

router.use(validateIds);
router.get('/', validateAnnouncementQuery, controller.list);
router.post('/', validateBody(createAnnouncementBody, 'announcementData'), controller.create);
router.get('/:announcementId', validateIds, controller.get);
router.patch('/:announcementId', validateIds, validateBody(updateAnnouncementBody, 'announcementUpdate'), controller.update);
router.delete('/:announcementId', validateIds, controller.remove);

export default router;
