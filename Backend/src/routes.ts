import { Router } from 'express';
import adminRoutes from './routes/admin';

const router = Router();

// Process liveness only; database connectivity is checked using npm run db:check.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/admin', adminRoutes);

// TODO: Add course-member routes for announcements, quizzes, submissions, search.
// TODO(file owner): integrate authorized storage/extraction operations.
// See ../../learnflow-openapi.yaml for the proposed endpoint contract.
// Add authentication and course authorization before exposing protected routes.

export default router;
