import { Router } from 'express';

const router = Router();

// Process liveness only; database connectivity is checked using npm run db:check.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// TODO: Mount feature routers from ./routes as they are implemented.
// See ../../learnflow-openapi.yaml for the proposed endpoint contract.
// Add authentication and course authorization before exposing protected routes.

export default router;
