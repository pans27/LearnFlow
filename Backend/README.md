# LearnFlow backend

Express 5, TypeScript, Prisma 7, and PostgreSQL 18. Node.js 24 and dependency
version ranges match the corresponding packages in `assignment 2`; `package-lock.json`
locks the installed versions for teammates.

## Endpoint status

The tables below list the endpoints currently registered by the Express app.
The [OpenAPI document](../learnflow-openapi.yaml) also describes planned endpoints
that are not implemented yet.

| Area | Current state |
| --- | --- |
| Health | Implemented: `GET /api/health` returns 200 with `{"status":"ok"}` |
| Authentication | Implemented: login, current user, logout, and password change |
| Administration | Implemented: user provisioning/updates, courses, and single/bulk enrollment management |
| User courses | Implemented: enrolled-course list, course detail, and role-aware dashboard |
| Announcements | Implemented: course-scoped list, read, create, edit, delete, visibility, and cursor pagination |
| Assignments | Implemented: list, detail, creation, updates, deletion, and instructor-controlled resubmission |
| Assignment submissions | Implemented: PDF upload/replacement, own submission, latest submissions with student identities, and authorized downloads |
| Quizzes and grading | Database and dashboard summaries exist; standalone endpoints are not implemented |
| Resources | Implemented: list, upload, detail, preview/download URLs, and deletion backed by S3 |
| PDF extraction and search | Uploads enqueue jobs; API-managed runner and parsing thread framework exist; parser implementation and search endpoints remain TODO |

The health endpoint checks process liveness; use `npm run db:check` to check the
database connection.

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

## Default administrator

Create the local default administrator after applying migrations:

```powershell
docker compose exec api npm run db:seed
# Or, when running Node locally with DATABASE_URL configured:
npm run db:seed
```

The default email is `admin@learnflow.local`. The seed generates a random
temporary password and displays it only when creating the account. Repeating
the seed preserves the existing administrator's password and settings. An email
already belonging to a non-admin or inactive account causes an error without
changing that account.

Optional `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` environment variables
override creation values; the password must contain 16–128 characters. Only a
salted hash is stored, with `isAdmin=true`, `isActive=true`, and
`mustChangePassword=true`. Login and the required first-login password replacement are implemented through
the auth endpoints.

The seed hash format is `scrypt$16384$8$1$<salt-hex>$<key-hex>`, using Node's
`scrypt` with N=16384, r=8, p=1, and a 64-byte key. Pass the salt's hex text as the
salt argument when verifying, and compare the decoded key using a constant-time
comparison; the authentication owner should change or adapt this format.

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
| `src/middleware/admin.ts` | Require the signed-in account's current administrator permission |
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
Add `assignments.ts` and `quizzes.ts` as those features are implemented.
Course operations check status and membership without explicitly locking the course row.
Transactions keep related writes, including bulk enrollment changes, atomic; an operation
already in progress may finish after archival or a membership change.
Admin-status changes retain an advisory lock to prevent concurrent demotions from
removing every active administrator.

## Auth endpoints

| Method | Path | Request and behavior | Success response |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Accept `email` and `password`; validate an active account and set the `learnflow.sid` cookie | 200 with the public user object |
| GET | `/api/auth/me` | Return the account identified by the verified session, including during a required password reset | 200 with the public user object |
| POST | `/api/auth/logout` | Revoke the current session and clear the cookie; repeated or unauthenticated logout is allowed | 204 without a body |
| POST | `/api/auth/change-password` | Accept `currentPassword` and `newPassword`; replace the password, clear `mustChangePassword`, revoke all user sessions, and clear the cookie | 204 without a body |

Login and profile responses contain `id`, `name`, `email`, `isAdmin`, and
`mustChangePassword`; password hashes and JWTs are not returned in the JSON body.
Send the cookie on subsequent requests. Browser fetch calls from a separate
frontend origin must include credentials and require matching server CORS setup.

The first-login flow is: log in with the temporary password, call
`/api/auth/change-password`, and log in again with the replacement password.
While `mustChangePassword` is true, only profile, logout, and password change are
available to that session; admin and course endpoints return 403.
New passwords must contain 12-128 characters and differ from the current password.
Malformed bodies and incorrect current passwords return 400; invalid login or
session credentials return 401 with `{"message":"Unauthorized"}`.

## Admin endpoints

All paths below begin with `/api/admin` and require a live session, an active
account, a completed password reset, and administrator permission.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/users` | List public user fields, never password hashes |
| POST | `/users` | Provision an account and return its generated temporary password once |
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

User provisioning accepts `name`, `email`, and optional `isAdmin` (default false).
It returns HTTP 201 with `{ "user": { ... }, "temporaryPassword": "..." }` and
`Cache-Control: no-store`. The password is generated by the server, stored only
as a salted hash, and must be replaced on first login. Caller-supplied passwords
are rejected; duplicate emails return 409, including case-insensitive matches.

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

## User course endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/courses` | List only the current user's enrolled courses, including for administrators |
| GET | `/api/courses/:courseId` | Get course metadata and the current user's course role |
| GET | `/api/courses/:courseId/dashboard` | Get recent updates and a student/instructor dashboard |

`src/middleware/session.ts` reads the `learnflow.sid` HttpOnly JWT cookie,
verifies its signature and expiry, and checks its backing PostgreSQL session.
It sets `req.session = { sessionId, currentUser: { id } }` only for a valid session.
`src/middleware/current-user.ts` reloads the account from PostgreSQL and sets
`res.locals.currentUser`. Missing/inactive
accounts return 401; accounts requiring a password change return 403.
Error messages are always `Unauthorized` for 401 and `Forbidden` for 403.
No ID is taken from an unverified request header, query parameter, or body.
Logout revokes the current session; password changes revoke all sessions for the
account. Administrator status and password-change flags are rechecked on every
protected request, so a valid cookie cannot retain removed privileges.

Use `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, and
`POST /api/auth/change-password` for the login flow. A temporary-password login
can access profile, logout, and password change, but cannot access admin/course
routes until the password is replaced and the user logs in again.
Set `JWT_SECRET` to at least 32 characters in production; development uses a
local fallback. Auth cookies use HttpOnly, SameSite=Lax, and Secure in production.

Course access is checked against current enrollments. Regular users cannot read
archived courses; administrators can read them with `readOnly: true`. A user's
`role` is null when an administrator accesses a course without enrollment.
`GET /api/courses` requires enrollment even for administrators; the admin course
list is the endpoint for viewing every course. Specific course and dashboard
reads require enrollment or administrator permission, otherwise they return
403 with `{"message":"Forbidden"}`. Missing courses return 404.

Dashboard limits are configured in `src/constants/dashboard.ts`.
Dashboards contain at most five recent announcements, five upcoming assessments,
and five recent resources. Recent sections sort by creation time descending with
ID tie-breaking. Upcoming assignments and quizzes have a due date at or after the
current time and sort by due date, type, and ID. Assessments with no deadline do
not appear in the upcoming section.

Students see visible announcements/assignments and visible published quizzes,
plus shared resources and their own private resources. They receive their own
latest quiz attempt status or assignment submission status. Instructors and
administrators also see hidden course materials and draft assessments, with
management permissions on active courses. Private notes belonging to other
users remain excluded. Answer keys, answers, scores, password hashes, and storage
keys never appear in dashboard summaries.

The instructor/admin view includes up to five active assessment submission rates:
visible assignments not past due and visible published quizzes currently open,
including assessments with no deadline. Rates count distinct currently enrolled,
active student accounts, so repeated quiz attempts do not inflate the rate.
Draft attempts and submissions from former/inactive members are excluded.
`submissionRate` is a fraction from 0 to 1, or 0 when no students are eligible;
`gradedCount` is null for assignments because their file-submission table has no
grading state. Archived dashboards disable all management permissions.

## Announcement endpoints

All paths below are under `/api/courses/:courseId/announcements` and require a
verified session and course access.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | List newest announcements with optional `limit` and `cursor` |
| POST | `/` | Create an announcement as a course instructor or administrator |
| GET | `/:announcementId` | Read one announcement from this course |
| PATCH | `/:announcementId` | Edit title, body, or visibility as an instructor/admin |
| DELETE | `/:announcementId` | Delete an announcement as an instructor/admin; return 204 |

Create with `{"title":"Update","body":"Full announcement text","isVisible":true}`.
Visibility defaults to true. Titles are limited to 200 characters and bodies to
20000 characters; both must be nonempty after trimming. Updates require at least
one allowed field. Author and course IDs are derived from the session/path and
cannot be supplied in the body.

Students see only visible announcements; instructors/admins can read hidden ones.
Hidden announcements return 404 to students, and cross-course IDs return 404.
Only administrators can read archived courses; announcement writes to archived
courses return 409. Any instructor in the course can edit/delete its announcements,
while editing preserves the original author.

Lists return arrays, ordered by `createdAt` descending and then ID descending.
Pagination defaults to 20 items and allows 1-100, configured in
`src/constants/announcements.ts`. If more items exist, the `X-Next-Cursor` header
contains the last returned ID; pass it as `cursor` on the next request. Missing,
hidden, deleted, or cross-course cursor records return 400, so restart pagination
without a cursor if it becomes stale. The header is omitted on the last page.
Separate-origin browser clients must expose this response header in their CORS
configuration. Dashboard announcements continue using the dashboard limit.

## Resource endpoints

All routes require a session and course access. Regular users must be enrolled in an active course; administrators may read archived courses, but uploads and deletion require an active course.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/courses/:courseId/resources` | Return all visible resources; optional `resourceType` filter; no pagination |
| POST | `/api/courses/:courseId/resources` | Upload multipart PDF and return the resource with 201 |
| GET | `/api/courses/:courseId/resources/:resourceId` | Return metadata and extraction status |
| GET | `/api/courses/:courseId/resources/:resourceId/preview` | Return `{ url, expiresAt }` for inline preview, valid for 300 seconds |
| GET | `/api/courses/:courseId/resources/:resourceId/download` | Return `{ url, expiresAt }` for attachment download, valid for 300 seconds |
| DELETE | `/api/courses/:courseId/resources/:resourceId` | Delete an authorized resource and its S3 object; return 204 |

Uploads accept `file` (a nonempty PDF up to 10 MB), `title` (1?200 trimmed characters), `resourceType` (`instructor_material` or `student_note`), and optional `visibility` (`visible` by default, or `hidden`). Students may upload student notes; instructors and administrators may also upload instructor materials. Uploads create resource metadata and a pending extraction job atomically after storing the PDF in S3; extraction itself is not implemented.

Readers see shared resources and their own private files. Instructors and administrators also see hidden instructor materials and assignment files, but other users' private student notes stay private. Deletion requires ownership or instructor/admin permission and visibility of the resource. The dashboard reuses this visibility filter and returns at most five resources without storage keys.

Responses contain `id`, `title`, `resourceType`, `ownerId`, `visibility`, `extractionStatus`, `fileKey`, and `createdAt`. Metadata updates (`PATCH`) and PDF search remain planned.

Set `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` in `Backend/.env` for local development or Docker Compose. The configured AWS credentials need object upload, read, and delete access to the bucket. S3 operations require these settings; metadata reads do not. Rebuild/recreate the API container after changing its environment.

## Assignment endpoints

All paths below start with `/api/courses/:courseId/assignments`. Session authentication and course access are required. Students see published assignments; instructors and administrators see hidden assignments as well.

| Method | Relative path | Behavior |
| --- | --- | --- |
| GET | `/` | List assignments visible to the caller |
| POST | `/` | Instructor/admin creates an assignment; return 201 with the assignment object |
| GET | `/:assignmentId` | Return assignment details |
| PATCH | `/:assignmentId` | Instructor/admin updates assignment settings |
| DELETE | `/:assignmentId` | Instructor/admin deletes an assignment without submissions; return 204 |
| POST | `/:assignmentId/submissions` | Student uploads or replaces their current PDF; return 200 with submission metadata |
| GET | `/:assignmentId/submissions/me` | Return the caller's current submission, or 404 |
| GET | `/:assignmentId/submissions` | Instructor/admin lists each student's latest submission with identity |
| GET | `/:assignmentId/submissions/:submissionId/download` | Owner or instructor/admin receives a download URL valid for 300 seconds |

Creation accepts `title` (required, 1-200 trimmed characters), `description` (up to 20000 characters or null), `dueAt` (timestamp with timezone or null), `isVisible` (default false), and `allowResubmission` (default false). PATCH accepts those same fields without changing omitted values. Student uploads require a visible assignment, an active course, and a deadline that has not passed; null `dueAt` has no deadline. Assignments with submissions cannot be deleted (409), preserving student work; hide them instead. Writes to archived courses return 409 for administrators; ordinary users cannot access archived courses (403).

Uploads use multipart `file` with one nonempty PDF up to 10 MB and no text fields. Student identity comes from the verified session. A first submission is allowed; subsequent uploads require instructor-controlled `allowResubmission=true`, otherwise 409. Replacement retains the submission ID, replaces the S3 key and filename, and refreshes `submittedAt`; only one row per assignment/student is retained. Concurrent uploads serialize only for that assignment/student, without a course lock. The last committed permitted upload becomes current.

Submission responses contain `id`, `courseId`, `assignmentId`, `studentId`, `originalFilename`, `submittedAt`, and `student: { id, name, email }`. Instructor lists include former members' submissions, ordered by student ID, and return an empty array when there are none. Students cannot list peers' work or download their files. Metadata never includes internal S3 keys. Downloads always sign the current file; previously issued URLs remain valid until expiration unless their object has been removed.

Failed database writes attempt cleanup of the new S3 object and preserve the previous submission. After replacement, the previous object is removed; cleanup failures are logged for manual follow-up (durable cleanup retries remain TODO). Assignment submissions are private files and do not enter the shared-resource extraction queue. Grading, additional file formats, frontend assignment UI integration, and final archival remain separate work.

## Team integration TODOs

Authentication integration:

- Login, session loading, logout, password changes, and administrator checks are connected.
- `POST /api/admin/users` uses the shared scrypt helper, returns a server-generated
  temporary password once with `Cache-Control: no-store`, and requires a password
  reset on first login. Caller-supplied passwords and unknown fields are rejected.
- Keep production cookie settings and any additional CSRF policy coordinated
  with the frontend's deployment origins.

File-processing owner:

- Storage upload, authorized preview/download, resource deletion, and pending extraction job creation are connected.
- Implement `parsePdf` and set `PDF_PARSER_READY=true` to enable the API-managed extraction runner; see the [file-processing handoff](docs/file-processing.md).
- Integrate final submission archival with S3 before marking submissions finalized.
  No S3 keys or extracted PDF content are fabricated by these endpoints.

Next backend slices: quizzes/questions, quiz submissions/grading, and
course-scoped PDF search. Their tables exist; their endpoints are not implemented yet.

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
verified JWT/database sessions, administrator authorization, and message-only errors. Coverage
includes strict validation, enrollment conflicts, archived
course protection, history retention, cross-course foreign keys, SQL checks,
full-text indexing, and concurrent last-admin protection.
