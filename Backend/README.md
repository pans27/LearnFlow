# LearnFlow backend

Express 5, TypeScript, Prisma 7, and PostgreSQL 18. Node.js 24 and dependency
version ranges match the corresponding packages in `assignment 2`; `package-lock.json`
locks the installed versions for teammates.

## Launch with Docker

Start Docker Desktop, then run from `Backend`:

```powershell
docker compose up --build -d --wait
```

This starts PostgreSQL, waits for it to become healthy, applies committed Prisma
migrations, and starts the API at http://localhost:3000. Verify it with:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
docker compose logs api
```

Database: `localhost:5432`, database/user `learnflow`, password `learnflow_dev`.
These are local development credentials. Ports bind to localhost. Database data
persists in a named Docker volume. `docker compose down` stops the stack while
preserving data. Set `DB_PORT` or `PORT` in `.env` if the defaults are occupied.
PostgreSQL 18 uses the `postgres18_data` volume mounted at `/var/lib/postgresql`;
the earlier PostgreSQL 17 volume is preserved separately.
The API container connects to `db:5432` regardless of the host database port.
Rebuild after source changes; the container does not mount or watch source files.

## Develop with Node locally

Use Node.js 24 and run from `Backend`. Start only PostgreSQL in Docker:

```powershell
docker compose up -d --wait db
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run db:deploy
npm run typecheck
npm run dev
```

If you changed `DB_PORT`, also update the port in `.env`'s `DATABASE_URL`.
Stop the API container first (`docker compose stop api`) if it occupies port 3000.
`npm start` runs without watching. `npm run db:check` verifies Prisma connectivity.

## Database ownership

All tables are in one PostgreSQL schema, `learnflow`. Every course-owned table
has `course_id`; there is no dynamic schema creation. The initial migration
preserves `../learnflow_single_schema.sql`, with idempotent schema creation for
Prisma. It includes users, courses, enrollments, sessions, announcements,
assignments, quizzes/questions, submissions, learning resources/pages, optional
assignment submissions, and extraction jobs.

Composite foreign keys prevent cross-course references. SQL checks constrain
roles, states, dates, attempts, scores, and finalized submission files. Triggers
maintain `updated_at`. Email uniqueness is case-insensitive. PDF pages have a
stored search vector and GIN index. These custom database features live in the
migration SQL; review future migrations so they remain intact.

`prisma/schema.prisma` maps snake_case SQL names to camelCase TypeScript models.
IDs are PostgreSQL INTEGER values and TypeScript numbers, returned as JSON numbers.
Path parameters are parsed from URL strings; JSON request IDs must be integers
between 1 and 2147483647. The initial migration creates integer IDs directly.
Use tagged Prisma raw queries only for database-specific operations.

Do not run the older shared/course-schema SQL files or apply the root SQL script
again. The committed Prisma migrations are the launch path for a fresh database.

```powershell
npm run prisma:validate
npm run prisma:generate
npm run db:migrate -- --name describe_change
npm run db:deploy
npm run db:studio
```

`db:migrate` is for creating development migrations; `db:deploy` applies committed
migrations. Generate the client after schema changes. Avoid `db push`, which does
not preserve the migration history and custom SQL features as a workflow.

## Request organization

The flow is router -> admin filter -> validation -> controller -> service -> database.

| Location | Responsibility |
| --- | --- |
| `src/types/` | Domain files for courses, users, enrollments, shared responses, and validation locals |
| `src/routes/admin.ts` | Wire method/path to middleware and controller |
| `src/middleware/admin.ts` | Call `next()` as a placeholder for the auth owner's filter |
| `src/validation/admin.ts` | Parse IDs and allowlisted request fields; reject malformed input |
| `src/middleware/validation.ts` | Put validated IDs/body in request-local response locals |
| `src/controllers/admin.ts` | Call services, choose HTTP status, serialize response DTOs |
| `src/services/admin.ts` | Enforce active-course rules and coordinate operations |
| `src/db/admin.ts` | Prisma access and transaction/locking boundaries |
| `src/lib/prisma.ts` | Share one lazy Prisma client and PostgreSQL adapter |
| `src/errors.ts`, `src/middleware/handler.ts` | Expected operation failures handled before the central error handler |
| `src/middleware.ts` | Log unhandled errors and return HTTP 500 |

The service coordinates operations inside database-managed transactions.
Types follow `a2`: raw body fields are optional, validated creation data has
required fields, and plain object types describe records and responses.
Controllers read named validation results from `res.locals as ValidatedLocals`.
The `types/index.ts` file re-exports domain types so existing imports stay simple.
Add `assignments.ts`, `quizzes.ts`, and `resources.ts` as those features are implemented.
Course writes lock the course row before checking status, so archiving cannot
race with an enrollment or metadata update. Admin-status changes are serialized
to prevent concurrent demotions from removing every active administrator.

## Admin endpoints implemented

All paths below begin with `/api/admin`; the placeholder auth filter currently
allows every request through by calling `next()`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/users` | List public user fields, never password hashes |
| GET | `/users/:userId` | Get a user |
| PATCH | `/users/:userId` | Update `name` and/or `isAdmin`; protect the last active admin |
| GET | `/courses` | List active and archived courses |
| POST | `/courses` | Create with required `name`, optional `courseCode` and `description` |
| PATCH | `/courses/:courseId` | Update metadata on an active course |
| PATCH | `/courses/:courseId/status` | Archive or reactivate |
| GET | `/courses/:courseId/enrollments` | List course memberships, including archived courses |
| POST | `/courses/:courseId/enrollments` | Enroll an active user with `userId` and `role` |
| POST | `/courses/:courseId/enrollments/bulk` | Add 1–100 users with individual course roles atomically |
| POST | `/courses/:courseId/enrollments/bulk-remove` | Remove 1–100 memberships atomically |
| PATCH | `/courses/:courseId/enrollments/:userId` | Change role to `student` or `instructor` |
| DELETE | `/courses/:courseId/enrollments/:userId` | Remove membership while preserving content/history |

A name-only course request remains compatible with the API contract: omitted
`courseCode` defaults to `name`. Archived courses reject metadata/enrollment
writes with 409; status changes are the exception that permits reactivation.
Duplicate enrollments return 409. Missing courses/users/memberships return 404.
Bodies reject unknown fields, empty updates, and incorrectly typed values.
See `../learnflow-openapi.yaml` for request/response shapes.
Errors use the HTTP response status and a JSON body containing only `message`.

Course creation returns HTTP 201 with the course object directly:

```json
{"id":1,"name":"Software","courseCode":"ECE1724","description":null,"status":"active"}
```

Bulk add accepts the following body and returns HTTP 201 with an array of the
created enrollment objects:

```json
{"enrollments":[{"userId":2,"role":"student"},{"userId":3,"role":"instructor"}]}
```

Bulk remove accepts `{"userIds":[2,3]}` and returns HTTP 204 without a body.
Duplicate IDs and batches outside 1–100 entries return 400. Both operations are
all-or-nothing: any missing user/membership, inactive account, existing membership,
or archived course rejects the request as applicable and rolls back all changes.
Other courses and the removed members' content remain intact.
Database failures are handled case by case in the database operation that can
produce them, such as duplicate or missing enrollments. Controllers and validation
middleware respond to expected failures locally; unexpected errors reach
`errorHandler`, which logs them and always returns 500.

## Team integration TODOs

Authentication owner:

- Mount session verification and CSRF protection before the admin router.
- Replace the `next()` placeholder with session verification and checks for
  `isActive`, `isAdmin`, and `mustChangePassword` on every admin request.
- Implement login/logout, password hashing/reset, session invalidation, and initial
  admin provisioning. The session table is storage groundwork, not a configured
  Express session store; adapt the table/store together as needed.
- Implement `POST /api/admin/users`: temporary-password generation and hashing,
  one-time response with `Cache-Control: no-store`, and `mustChangePassword=true`.
  The route currently returns 501 and never creates partial accounts.

File-processing owner:

- Implement authorized storage uploads/downloads, PDF extraction workers, and
  writes to `learning_resources`, `resource_pages`, and `extraction_jobs`.
- Integrate final submission archival with S3 before marking submissions finalized.
  No S3 keys or extracted PDF content are fabricated by these endpoints.

Next backend slices: course-member authorization, course management reads,
announcements, quizzes/questions, submissions/grading, and course-scoped PDF
search. Their tables exist; their endpoints are not implemented yet.

## Verification

```powershell
npm run typecheck
npm test
```

By default database integration tests skip. To include them against the local
Docker database, use a PostgreSQL role allowed to create temporary databases:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://learnflow:learnflow_dev@localhost:5432/learnflow'
npm test
```

The integration suite creates, migrates, and deletes its own uniquely named test
database. It never clears existing application tables. Tests exercise the
pass-through admin filter and message-only errors. Coverage
includes strict validation, enrollment conflicts, archived
course protection, history retention, cross-course foreign keys, SQL checks,
full-text indexing, and concurrent last-admin protection.
