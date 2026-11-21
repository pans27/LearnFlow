# File-processing handoff

Resource uploads already store the PDF in S3, then create `learning_resources` and a `pending` `extraction_jobs` row in one database transaction. A failed database write rolls back both rows and attempts to remove the uploaded object.

The API starts the polling runner from `src/server.ts` once the parser is ready. Database and S3 coordination run asynchronously in the API process; CPU-heavy parsing runs in a separate Node `worker_threads` thread for each PDF. No separate worker process or Docker service is needed.

## Processor contract

Implement `parsePdf(bytes)` in `src/workers/pdf-parser.ts` using the team's chosen PDF library. Return an ordered array of `{ pageNumber, text }` with consecutive numbers starting at 1. Include pages without text as `{ pageNumber, text: '' }`; an empty array represents a document with no pages.

Set `PDF_PARSER_READY = true` in that file only after implementing and testing the parser, then restart/rebuild the API. Until then, startup logs that extraction is paused and leaves pending jobs untouched. The old separate worker script has been removed.

`src/workers/pdf-processor.ts` reads the private S3 PDF, transfers its bytes to `pdf-thread.ts`, and waits for extracted pages. Each parsing thread has a 30-second timeout and is terminated after its result or failure. Private S3 downloads have a 30-second deadline and a 10 MB limit; empty files are rejected. The parser thread receives document bytes only and has no database responsibilities.

Node 24 loads the thread's TypeScript directly, without inheriting the API's tsx flags. Keep thread imports compatible with native TypeScript stripping and explicit file extensions; the parser currently imports only shared types.

## Job lifecycle

`processNextExtraction(processPdf)` processes at most one job and returns `idle`, `completed`, `failed`, or `discarded`. It throws if claiming or recording a failure cannot reach the database; the worker runner must log and retry infrastructure failures separately.

Jobs move from `pending` to `processing`, then to `completed` or `failed`. Failed jobs remain eligible until `attempts` reaches `maxAttempts` (3 by default). The runner polls idle queues every 2 seconds and pauses 5 seconds after processing or infrastructure failures; successful work continues immediately. Claiming increments attempts and updates the resource status atomically. Workers lock only the selected job using `FOR UPDATE SKIP LOCKED`, without explicitly locking the course.

SIGINT/SIGTERM stops HTTP requests and new job claims, interrupts an idle wait, then waits for in-flight processing before closing PostgreSQL. Server shutdown allows up to 75 seconds for the bounded download and parsing steps; Docker allows 80 seconds before killing the API container. Infrastructure failures and processor failures are logged.

S3 reads and PDF parsing run outside database transactions. Completion replaces all resource pages, updates `pageCount`, and finishes the job/resource in one transaction. PostgreSQL generates the full-text search vectors for stored pages. An attempt number guards against stale completions, and a resource deleted during processing causes the result to be discarded.

## Remaining owner work

- Implement PDF text extraction and any OCR policy in `pdf-parser.ts`, then mark the parser ready.
- Add parser-specific document/page limits and choose a PDF dependency that works in the Node 24 worker thread; S3 reading, polling, thread timeouts, and graceful shutdown are provided.
- Add leases/heartbeats and recovery for crashed workers; currently a job left in `processing` is not reclaimed automatically.
- Coordinate one active extraction job per resource before adding manual reprocessing; uploads currently enqueue exactly one job.
- Add PostgreSQL `NOTIFY` publication/listening for status updates if needed; polling resource detail already exposes `extractionStatus`, but notifications are not implemented.
- Add cleanup retries for failed S3 object deletion and coordinate final submission archival separately.

No schema migration or PDF library is needed for this framework. Run `npm run typecheck` and set `TEST_DATABASE_URL` before `npm test` to exercise concurrent claiming, bounded retries, stale attempts, generated search vectors, and deletion during processing.
