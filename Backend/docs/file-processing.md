# File-processing handoff

Resource uploads already store the PDF in S3, then create `learning_resources` and a `pending` `extraction_jobs` row in one database transaction. A failed database write rolls back both rows and attempts to remove the uploaded object.

The API starts the polling runner from `src/server.ts`; `PDF_PARSER_READY` is true because text-layer parsing is implemented. Database and S3 coordination run asynchronously in the API process; CPU-heavy parsing runs in a separate Node `worker_threads` thread for each PDF. No separate worker process or Docker service is needed.

## Processor contract

`parsePdf(bytes)` in `src/workers/pdf-parser.ts` uses `unpdf` to extract text layers and returns an ordered array of `{ pageNumber, text }` with consecutive numbers starting at 1. Pages without text use `{ pageNumber, text: '' }`; an empty array represents a document with no pages. Image-only PDFs require OCR, which is not implemented.

The parser is enabled at API startup and consumes pending jobs automatically. Install locked dependencies with `npm ci` after pulling this change; Docker builds install them automatically. Files over 10 MB or 500 pages fail with bounded retries. The old separate worker script has been removed.

`src/workers/pdf-processor.ts` reads the private S3 PDF, transfers its bytes to `pdf-thread.ts`, and waits for extracted pages. Each parsing thread has a 30-second timeout and is terminated after its result or failure. Private S3 downloads have a 30-second deadline and a 10 MB limit; empty files are rejected. The parser thread receives document bytes only and has no database responsibilities.

Node 24 loads the thread's TypeScript directly, without inheriting the API's tsx flags. Keep thread imports compatible with native TypeScript stripping and explicit file extensions; the parser imports `unpdf` and shared types.

## Job lifecycle

`processNextExtraction(processPdf)` processes at most one job and returns `idle`, `completed`, `failed`, or `discarded`. It throws if claiming or recording a failure cannot reach the database; the worker runner must log and retry infrastructure failures separately.

Jobs move from `pending` to `processing`, then to `completed` or `failed`. Failed jobs remain eligible until `attempts` reaches `maxAttempts` (3 by default). The runner polls idle queues every 2 seconds and pauses 5 seconds after processing or infrastructure failures; successful work continues immediately. Claiming increments attempts and updates the resource status atomically. Workers lock only the selected job using `FOR UPDATE SKIP LOCKED`, without explicitly locking the course.

SIGINT/SIGTERM stops HTTP requests and new job claims, interrupts an idle wait, then waits for in-flight processing before closing PostgreSQL. Server shutdown allows up to 75 seconds for the bounded download and parsing steps; Docker allows 80 seconds before killing the API container. Infrastructure failures and processor failures are logged.

S3 reads and PDF parsing run outside database transactions. Completion replaces all resource pages, updates `pageCount`, and finishes the job/resource in one transaction. PostgreSQL generates the full-text search vectors for stored pages. An attempt number guards against stale completions, and a resource deleted during processing causes the result to be discarded.

## Remaining owner work

- Decide whether OCR is needed for image-only PDFs; text-layer extraction is implemented.
- Text-layer parsing, 10 MB/500-page limits, polling, thread timeouts, and graceful shutdown are implemented and tested.
- Add leases/heartbeats and recovery for crashed workers; currently a job left in `processing` is not reclaimed automatically.
- Coordinate one active extraction job per resource before adding manual reprocessing; uploads currently enqueue exactly one job.
- Add PostgreSQL `NOTIFY` publication/listening for status updates if needed; polling resource detail already exposes `extractionStatus`, but notifications are not implemented.
- Add cleanup retries for failed S3 object deletion and coordinate final submission archival separately.

No schema migration is needed for the parser/search feature; `unpdf` is included in the lockfile. Run `npm run typecheck` and set `TEST_DATABASE_URL` before `npm test` to exercise concurrent claiming, bounded retries, stale attempts, generated search vectors, and deletion during processing.

## Search integration

`GET /api/courses/:courseId/resources/search?q=...` searches stored page vectors with PostgreSQL English web-search syntax. Course membership and resource visibility are enforced before returning metadata and `{ page, snippet }` matches. Results include at most five pages per resource and 250 total page hits, ordered newest resource first, without pagination. Students cannot search other users' private notes or other courses. Admins may inspect permitted content but cannot change course content. Snippets are plain text, so no HTML rendering is required.
