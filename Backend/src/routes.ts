import { Router } from 'express';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import courseRoutes from './routes/courses';
import type { HealthResponse } from './types';

const router = Router();

// Process liveness only; database connectivity is checked using npm run db:check.
router.get<{}, HealthResponse>('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/courses', courseRoutes);

// TODO: Add course-member routes for assignments, quizzes, submissions, and search.
// TODO(file owner): run the extraction worker that reads stored PDFs and writes page text.
// See ../../learnflow-openapi.yaml for the proposed endpoint contract.

export default router;
