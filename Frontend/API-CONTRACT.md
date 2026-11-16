# LearnFlow API contract · discussion draft

This is a proposed contract, not an assertion that the backend already implements it. Canonical frontend signatures are in src/types/index.ts; HTTP mappings are in src/services/api.ts. All IDs are opaque strings and dates are ISO 8601 timestamps with timezone. Current responses use bare objects/arrays, not envelopes. If the team chooses `{ courses: [...] }`, adapt the HTTP layer before switching modes.

Base URL: /api. JSON requests and responses except multipart upload. Cookie session proposed; credentials: include. Failures: non-2xx status with `{ "error": { "code": "FORBIDDEN", "message": "Instructor access required" } }`. Use 401 for unauthenticated, 403 for forbidden, 404 for missing, 422 for validation. Empty successful mutations return 204.

| Method | Endpoint                                       | Request              | Success body                                        |
| ------ | ---------------------------------------------- | -------------------- | --------------------------------------------------- |
| POST   | /auth/login                                    | {email,password}     | User                                                |
| GET    | /auth/me                                       | —                    | User                                                |
| POST   | /auth/logout                                   | —                    | 204                                                 |
| GET    | /courses                                       | —                    | Course[] accessible to current user                 |
| GET    | /courses/:courseId                             | —                    | Course including current user's course role         |
| GET    | /courses/:courseId/dashboard                   | —                    | {announcements,upcomingAssessments,recentResources} |
| GET    | /courses/:courseId/announcements               | —                    | Announcement[] including full body                  |
| POST   | /courses/:courseId/announcements               | {title,body}         | Announcement; instructor only                       |
| GET    | /courses/:courseId/quizzes                     | —                    | Quiz[] including student-safe questions             |
| GET    | /courses/:courseId/quizzes/:quizId/draft       | —                    | Answers (empty object if none)                      |
| PUT    | /courses/:courseId/quizzes/:quizId/draft       | {answers}            | 204                                                 |
| POST   | /courses/:courseId/quizzes/:quizId/submissions | {answers}            | Submission receipt                                  |
| GET    | /courses/:courseId/resources?q=                | optional query       | Resource[] (metadata search in this version)        |
| POST   | /courses/:courseId/resources                   | multipart field file | Resource; proposed 10 MB PDF limit                  |
| GET    | /admin/users                                   | —                    | User[]; system admin only                           |

Current frontend detail routes derive announcement/quiz details from list data. If quizzes become large, split summaries and detail endpoints. Never return answer keys to student list/detail requests.

Example GET /courses:

```json
[
  {
    "id": "web",
    "code": "ECE 1724",
    "name": "Advanced Web Development",
    "description": "Build thoughtful experiences for the modern web.",
    "role": "student",
    "status": "active"
  }
]
```

Example GET /courses/web/quizzes:

```json
[
  {
    "id": "q1",
    "title": "Knowledge check",
    "dueAt": "2026-11-13T23:59:00-05:00",
    "questions": [
      {
        "id": "one",
        "prompt": "Which method retrieves a resource?",
        "options": ["GET", "POST", "DELETE"]
      }
    ]
  }
]
```

Example submit request: `{"answers":{"one":"GET"}}`. Response: `{"id":"submission-id","submittedAt":"2026-11-06T20:00:00Z","status":"submitted"}`. Options currently use their text as the answer value; agree on stable option IDs before supporting edits/translations.

## Decisions for the team

1. Member 3: cookie session vs JWT, CSRF protections, permitted frontend origins, register vs admin-created users, password policy.
2. Member 2: response envelopes and pagination; course roles vs global admin; dashboard key naming (this draft uses upcomingAssessments).
3. Member 2: single choice only vs additional question types, availability windows, attempts, draft ownership, late/repeated submission, idempotency, grading visibility and result endpoint.
4. Member 3: backend multipart vs S3 presigned upload, access policy, file size/type validation, processing polling, download URL expiry, full-text search response (page, snippet, resourceId).
5. Admin: agree on course creation/archive and enrollment mutation contracts before adding editing controls. Backend must enforce all permissions even when frontend hides controls.

Suggested first integration: auth/me, courses, course detail, dashboard. Review this document together before implementing the remaining APIs. Mock data and HTTP share the LearnFlowApi interface so backend implementation can proceed in parallel with UI.

## Updated UI agreement

- Users sign in with provisioned accounts. No self-registration page or endpoint is required.
- /admin is a separate admin layout, outside the student/instructor course shell. Open it directly as an admin. Global systemRole controls admin access; course.role controls instructor tools.
- Dashboard upcomingAssessments is Assessment[]: {id,title,kind:"assignment"|"quiz"|"exam",dueAt,description,quizId?}. For quizzes, quizId links to the quiz route. Assignment/exam entries currently display schedule and instructions; no submission flow is implied.
- Dashboard displays latest three full-body announcements, sorted newest first. No truncated body in this response.
- POST /courses/:courseId/quizzes takes {title,dueAt,questions:[{id,prompt,options:string[]}]} and returns Quiz. This initial authoring form creates one single-choice question; answer keys and grading are pending agreement.
- Resource upload is instructor-only, enforced by the mock service and to be enforced by the backend as well.
