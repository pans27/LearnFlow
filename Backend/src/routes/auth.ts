import { Router } from 'express';
import * as controller from '../controllers/auth';

const router = Router();

router.post('/login', controller.login);
router.get('/me', controller.me);
router.post('/logout', controller.logout);
router.post('/change-password', controller.changePassword);

export default router;
