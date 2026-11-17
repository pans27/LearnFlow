import express from 'express';
import routes from './routes';
import { errorHandler, notFound, requestLogger } from './middleware';
import { loadSession } from './middleware/session';

const app = express();
app.disable('x-powered-by');
app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));
app.use(loadSession);
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
