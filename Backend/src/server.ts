import app from './app';
import { config } from './config';
import { closeDatabase } from './database';

const server = app.listen(config.port, () => {
  console.log(`LearnFlow API listening on http://localhost:${config.port}`);
});

server.on('error', (error) => {
  console.error('Server failed:', error);
  process.exitCode = 1;
});

let shuttingDown = false;
// Close the HTTP listener and database connection before exiting.
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(async (error) => {
    try {
      await closeDatabase();
      process.exitCode = error ? 1 : 0;
    } catch (databaseError) {
      console.error('Database shutdown failed:', databaseError);
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
