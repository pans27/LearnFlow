import app from './app';
import { config } from './config';
import { closeDatabase } from './database';
import { runExtractionWorker } from './workers/runner';
import { processPdf } from './workers/pdf-processor';
import { PDF_PARSER_READY } from './workers/pdf-parser';

const extractionShutdown = new AbortController();
let extractionRunner: Promise<void> = Promise.resolve();

const server = app.listen(config.port, () => {
  console.log(`LearnFlow API listening on http://localhost:${config.port}`);
  // Consume queued extraction jobs once the tested parser is enabled.
  if (PDF_PARSER_READY) {
    extractionRunner = runExtractionWorker(processPdf, { signal: extractionShutdown.signal }).catch((error) => {
      console.error('Extraction runner stopped:', error);
      process.exitCode = 1;
    });
  } else {
    console.log('PDF extraction paused: parser implementation is pending');
  }
});

server.on('error', (error) => {
  console.error('Server failed:', error);
  process.exitCode = 1;
});

let shuttingDown = false;
// Stop HTTP requests and extraction claims before waiting for work and closing the database.
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  extractionShutdown.abort();
  const timeout = setTimeout(() => process.exit(1), 75000);
  timeout.unref();
  server.close(async (error) => {
    try {
      await extractionRunner;
      await closeDatabase();
      process.exitCode = error ? 1 : (process.exitCode ?? 0);
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
