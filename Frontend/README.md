# LearnFlow Frontend

LearnFlow is an ECE 1724 course workspace for announcements, assessments, and shared learning resources. Version 0.1.0 is a React and TypeScript frontend prototype that runs with mock data by default.

## Run locally

Use Node.js 24. Open this frontend folder in VS Code and run these commands in its terminal:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. If you opened the team repository root, run `cd Frontend` first. No database, backend server, or environment variables are needed for the mock demo.

```sh
npm test
npm run build
```

## Demo accounts

| Email | Role |
| --- | --- |
| `alex@learnflow.demo` | Instructor in ECE 1779, student in the other demo courses, and system administrator |
| `student@learnflow.demo` | Jamie Patel, student in the demo courses |

Both accounts use the demo password `demo-password`. Use the same browser and local URL when switching accounts so the demo can share quiz and submission records.

## Demo walkthrough

1. Open **ECE 1779 · Cloud Computing → Quizzes**. As Jamie, **Cloud fundamentals (automatic grades)** shows **4 / 10** in the list. Open the quiz to see feedback.
2. **Cloud architecture (manual release)** initially shows **— / 10** for Jamie. Sign out and sign in as Alex, then open that quiz and expand Jamie's submission.
3. Enter a short-answer score from **0 to 6**, write feedback, and click **Save grades and feedback**. Click **Publish grades** at the top of the quiz. Manual publication requires saved scores for every submission.
4. Sign back in as Jamie. With **5** short-answer points, the list shows **9 / 10**. Open the quiz to read the saved feedback.

The instructor can create quizzes with single-choice, multiple-choice, and short-answer questions. Choice questions are scored from the answer key. A multiple-choice answer earns credit when the selected options exactly match the key. Choice-only quizzes can release grades immediately or wait for publication.

In **Resources**, students can share PDF or Word notes and instructors can upload any format (up to 10 MB in the demo). Search resource titles and filenames, or search the sample PDF text for `authentication` or `API`. Sample PDFs open and download, and files uploaded in the current page session can be downloaded. The course overview includes complete recent announcements and upcoming assessment dates.

## Mock data and integration

- Browser storage retains mock quizzes, drafts, submissions, grades, and feedback. Refreshing keeps that quiz data, and the manual demo stays published after publication.
- New announcements and resource uploads are session demo data. Uploaded PDFs are available to open during the page session. Text search in the demo uses sample PDF text. File persistence, extraction, and real access control require the backend.
- The independent admin page at `/admin` demonstrates user listing. Course and enrollment management are future work. Accounts are provisioned, with no public registration flow.
- [.env.example](.env.example) lists the Vite settings. The HTTP client and [API contract notes](API-CONTRACT.md) are starting points for integration. Confirm the endpoint paths and payloads against the team's OpenAPI specification before setting `VITE_USE_MOCK=false`. Keep real credentials out of Vite variables.

The team repository uses `Frontend/` for this application. Review any existing files in that folder before integrating this version on a feature branch.

