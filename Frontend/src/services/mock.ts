import { validateResourceFile } from "@/lib/resource-files";
import type {
  LearnFlowApi,
  Course,
  Announcement,
  Resource,
  Answers,
  Quiz,
  QuizSubmissionRecord,
  User,
} from "@/types";
export const mockCourses: Course[] = [
  {
    id: "web",
    code: "ECE 1724",
    name: "Advanced Web Development",
    description: "Build thoughtful experiences for the modern web.",
    role: "student",
    status: "active",
  },
  {
    id: "cloud",
    code: "ECE 1779",
    name: "Cloud Computing",
    description: "Design scalable systems, one service at a time.",
    role: "instructor",
    status: "active",
  },
  {
    id: "data",
    code: "ECE 1767",
    name: "Data Structures & Algorithms",
    description: "Explore the ideas behind efficient software.",
    role: "student",
    status: "active",
  },
];
const user = {
  id: "demo",
  name: "Alex Chen",
  email: "alex@learnflow.demo",
  systemRole: "admin" as const,
};
const student: User = {
  id: "demo-student",
  name: "Jamie Patel",
  email: "student@learnflow.demo",
  systemRole: "user",
};
function activeUser() {
  const session = sessionStorage.getItem("learnflow:session");
  if (!session) throw Error("Please sign in");
  return session === student.id ? student : user;
}

function readDemo<T>(key: string, fallback: T): T {
  return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
}
function writeDemo<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}
const announcements: Record<string, Announcement[]> = {};
const resources: Record<string, Resource[]> = {};
function check(id: string) {
  const c = mockCourses.find((c) => c.id === id);
  if (!c) throw Error("Course not found");
  return activeUser().id === student.id
    ? { ...c, role: "student" as const }
    : c;
}
function news(id: string) {
  check(id);
  return (announcements[id] ??= [
    {
      id: "welcome",
      title: "Week 06 · Lecture preparation and project checkpoint",
      createdAt: "2026-11-05T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "This week we will connect the ideas from our lectures to your team project. Before the next class, review the Week 06 notes and complete the short knowledge check. Pay particular attention to how the frontend handles loading, empty results, and errors when requesting data.\n\nFor the project checkpoint, your team should be able to demonstrate a basic journey from sign-in to a course page. Your backend does not need to be complete: you may use mock data as long as your team has agreed on the request and response formats. Please identify clearly which parts of your demonstration are simulated.\n\nBring a short list of open questions to class, especially around authentication, permissions, and file uploads. We will use the final part of the session to discuss common integration problems and review examples together.",
    },
    {
      id: "office",
      title: "Office hours · Friday project feedback",
      createdAt: "2026-11-04T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "Office hours will take place this Friday from 2:00–4:00 pm. You can use this session to ask about lecture material, review a design decision, or get feedback on your current project progress. Teams are welcome to attend together.\n\nTo make the discussion useful, prepare a short description of the issue and the steps needed to reproduce it. If your question involves frontend behavior, have the relevant page running locally. If it concerns an API, bring an example request and response rather than only the endpoint name.\n\nWe will aim to spend about ten minutes with each team before moving to the next group. If you cannot attend, send your questions through the course communication channel in advance so that we can arrange a follow-up.",
    },
    {
      id: "milestone",
      title: "Prototype milestone · What to include",
      createdAt: "2026-11-03T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "Your next milestone is a working frontend prototype that communicates the structure of your application. Focus on a complete navigation flow and meaningful content rather than trying to finish every feature at once.\n\nInclude a course selection screen, a course overview, and at least one working interaction such as saving a quiz draft or publishing a mock announcement. Your pages should remain readable on a smaller screen and should explain what happened when a request fails.\n\nSubmit one progress report per team with a link to your repository, instructions for running the prototype, and a list of completed and pending features. Each team member should briefly describe their contribution and the next integration task they plan to complete.",
    },
    {
      id: "resources",
      title: "Updated lecture notes and practice material",
      createdAt: "2026-11-02T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "The resource library now includes the Week 06 lecture notes and the project planning guide. The notes contain additional examples of client-side routing, shared layouts, and typed service interfaces that we did not have time to cover in detail during class.\n\nStart with the examples that match your current task, then try adapting them to your own project. You do not need to reproduce the example structure exactly, but you should be able to explain why your team chose a particular approach.\n\nIf you notice a typo or an unclear example, please mention the document title and the relevant section in your question. We will collect corrections and publish an updated version after the next lecture.",
    },
    {
      id: "exam",
      title: "Midterm preparation · Scope and format",
      createdAt: "2026-11-01T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "The midterm will cover material from weeks 1–6, including component design, state management, HTTP requests, and application architecture. Questions may ask you to explain a concept, read a short code example, or identify a problem in a proposed implementation.\n\nUse the lecture examples and practice questions as your main preparation. Make sure you understand the reasoning behind the code rather than memorizing an exact implementation. We will review the format and answer questions during the next class.\n\nThe date is shown in Upcoming assessments. Room information and any permitted materials will be confirmed in a separate announcement. Please check the course page again before the exam.",
    },
    {
      id: "teams",
      title: "Team coordination and repository setup",
      createdAt: "2026-10-30T15:00:00Z",
      author: "Dr. Morgan Lee",
      body: "Please confirm your team members and agree on how you will organize your shared repository. Separate frontend and backend folders are a reasonable starting point, but your team may choose another structure if it fits your workflow.\n\nWork on feature branches and review changes before merging them into the shared branch. Avoid committing local environment files or credentials. Include setup instructions so that another team member can run the project without guessing which commands or settings are required.\n\nBefore implementation grows, agree on your first API contracts and write down any assumptions that are still open. This will help the frontend and backend progress in parallel and make your first integration session much easier.",
    },
  ]);
}
const demoPages: Record<string, { page: number; snippet: string }[]> = {
  notes: [
    {
      page: 2,
      snippet:
        "Authentication identifies the user. Authorization checks whether the user may access a course or perform an action.",
    },
    {
      page: 5,
      snippet:
        "An API response should distinguish loading, empty results, and request failures in the frontend.",
    },
  ],
  guide: [
    {
      page: 1,
      snippet:
        "Agree on an API contract before implementing your first integration. Include examples of success and error responses.",
    },
    {
      page: 3,
      snippet:
        "Test authentication, course roles, and resource ownership before demonstrating protected workflows.",
    },
  ],
};
function files(id: string) {
  check(id);
  return (resources[id] ??= [
    {
      id: "notes",
      demoFile: {
        url: import.meta.env.BASE_URL + "samples/notes.pdf",
        name: "notes.pdf",
        previewable: true,
      },
      name: "Week 06 · Lecture notes",
      description: "Key concepts, examples, and further reading.",
      status: "ready",
      resourceType: "instructor_material",
      createdAt: "2026-11-05T15:00:00Z",
    },
    {
      id: "guide",
      demoFile: {
        url: import.meta.env.BASE_URL + "samples/guide.pdf",
        name: "guide.pdf",
        previewable: true,
      },
      name: "Project planning guide",
      description:
        "A practical checklist for your team project, shared by a student.",
      resourceType: "student_note",
      status: "ready",
      createdAt: "2026-11-03T15:00:00Z",
    },
  ]);
}
const quizKey = (courseId: string) => `learnflow:quizzes:v2:${courseId}`;
const answerKeyKey = (courseId: string, quizId: string) =>
  `learnflow:answer-key:v2:${courseId}:${quizId}`;
const submissionsKey = (courseId: string, quizId: string) =>
  `learnflow:submissions:v2:${courseId}:${quizId}`;
const cloudQuizExamples: { quiz: Quiz; submission: QuizSubmissionRecord }[] = [
  {
    quiz: {
      id: "demo-auto-release",
      title: "Demo · Cloud fundamentals (automatic grades)",
      dueAt: "2026-11-21T23:59:00-05:00",
      releaseGrades: "automatic",
      questions: [
        {
          id: "scaling",
          kind: "single_choice",
          prompt: "Which approach adds more instances to handle demand?",
          options: ["Horizontal scaling", "Vertical scaling"],
          points: 4,
        },
        {
          id: "reliability",
          kind: "multiple_choice",
          prompt: "Which practices improve availability?",
          options: [
            "Deploy across zones",
            "Use health checks",
            "Use a single instance",
          ],
          points: 6,
        },
      ],
    },
    submission: {
      id: "demo-auto-jamie",
      studentId: student.id,
      studentName: student.name,
      submittedAt: "2026-11-15T18:00:00-05:00",
      status: "submitted",
      answers: {
        scaling: "Horizontal scaling",
        reliability: ["Use health checks"],
      },
      marks: { scaling: 4, reliability: 0 },
      feedback:
        "For the availability question, select every applicable practice. Health checks and deploying across zones both improve availability.",
      published: true,
    },
  },
  {
    quiz: {
      id: "demo-manual-release",
      title: "Demo · Cloud architecture (manual release)",
      dueAt: "2026-11-23T23:59:00-05:00",
      releaseGrades: "manual",
      questions: [
        {
          id: "routing",
          kind: "single_choice",
          prompt:
            "What distributes traffic across multiple application instances?",
          options: ["Load balancer", "Object storage"],
          points: 4,
        },
        {
          id: "design",
          kind: "short_answer",
          prompt:
            "Explain how deploying across two availability zones helps a web application stay online.",
          options: [],
          points: 6,
        },
      ],
    },
    submission: {
      id: "demo-manual-jamie",
      studentId: student.id,
      studentName: student.name,
      submittedAt: "2026-11-15T18:15:00-05:00",
      status: "submitted",
      answers: {
        routing: "Load balancer",
        design:
          "If one zone fails, the load balancer can send traffic to healthy instances in the other zone.",
      },
      marks: { routing: 4 },
      published: false,
    },
  },
];
function quizzes(id: string): Quiz[] {
  check(id);
  return [
    {
      id: "q1",
      title: "Week 06 · Knowledge check",
      dueAt: "2026-11-13T23:59:00-05:00",
      releaseGrades: "manual",
      questions: [
        {
          id: "one",
          prompt: "Which HTTP method is intended for retrieving a resource?",
          options: ["GET", "POST", "DELETE"],
        },
        {
          id: "two",
          prompt: "Where should access permissions be enforced?",
          options: ["Only in the browser", "On the backend", "In CSS"],
        },
      ],
    },
    ...(id === "cloud" ? cloudQuizExamples.map(({ quiz }) => quiz) : []),
    ...readDemo<Quiz[]>(quizKey(id), []),
  ];
}
const demoNow = Date.now();
const demoDue = (hours: number) =>
  new Date(demoNow + hours * 60 * 60 * 1000).toISOString();
const key = (id: string, q: string) =>
  `learnflow:draft:v2:${activeUser().id}:${id}:${q}`;
export const mockApi: LearnFlowApi = {
  async me() {
    return activeUser();
  },
  async login({ email, password }) {
    if (!email.includes("@") || !password)
      throw Error("Enter an email and password");
    const account =
      email.trim().toLowerCase() === student.email ? student : user;
    sessionStorage.setItem("learnflow:session", account.id);
    return account;
  },
  async logout() {
    sessionStorage.removeItem("learnflow:session");
  },
  async courses() {
    return mockCourses.map((course) => check(course.id));
  },
  async course(id) {
    return check(id);
  },
  async dashboard(id) {
    return {
      announcements: news(id).filter(
        (a) => check(id).role === "instructor" || a.isVisible !== false,
      ),
      upcomingAssessments: [
        {
          id: "overdue-practice",
          title: "Week 05 · Practice reflection",
          kind: "assignment" as const,
          dueAt: demoDue(-24),
          description:
            "Demo of an overdue assignment. Past due dates remain red.",
        },
        {
          id: "urgent-checkpoint",
          title: "Team progress update",
          kind: "assignment" as const,
          dueAt: demoDue(48),
          description:
            "Share your current progress and the next step for your team.",
        },
        ...quizzes(id).map((q) => ({
          id: q.id,
          title: q.title,
          kind: "quiz" as const,
          dueAt: q.dueAt,
          quizId: q.id,
          description: q.questions.length + " questions",
        })),
        {
          id: "assignment-1",
          title: "Project milestone · Frontend prototype",
          kind: "assignment" as const,
          dueAt: "2026-11-16T23:59:00-05:00",
          description:
            "Submit your team prototype and a short progress report through the course submission channel.",
        },
        {
          id: "exam-1",
          title: "Midterm examination",
          kind: "exam" as const,
          dueAt: "2026-11-20T14:00:00-05:00",
          description:
            "In-person exam. Covers weeks 1–6; room details will be announced by your instructor.",
        },
        {
          id: "assignment-2",
          title: "API integration checkpoint",
          kind: "assignment",
          dueAt: "2026-11-23T23:59:00-05:00",
          description:
            "Connect your first backend endpoint and report any remaining contract differences.",
        },
        {
          id: "exam-2",
          title: "Project demonstration",
          kind: "exam",
          dueAt: "2026-11-27T14:00:00-05:00",
          description:
            "Team demonstration and questions. Prepare your application and a short walkthrough.",
        },
        {
          id: "assignment-3",
          title: "Final project report",
          kind: "assignment",
          dueAt: "2026-11-29T23:59:00-05:00",
          description:
            "Submit your project report, setup instructions, and individual contribution summary.",
        },
      ],
      recentResources: files(id),
    };
  },
  async announcements(id) {
    return news(id).filter(
      (a) => check(id).role === "instructor" || a.isVisible !== false,
    );
  },
  async createAnnouncement(id, input) {
    if (check(id).role !== "instructor")
      throw Error("Instructor access required");
    const a = {
      ...input,
      id: crypto.randomUUID(),
      author: activeUser().name,
      createdAt: new Date().toISOString(),
    };
    news(id).unshift(a);
    return a;
  },
  async updateAnnouncement(id, announcementId, input) {
    if (check(id).role !== "instructor")
      throw Error("Instructor access required");
    const item = news(id).find((a) => a.id === announcementId);
    if (!item) throw Error("Announcement not found");
    Object.assign(item, input);
    return { ...item };
  },
  async deleteAnnouncement(id, announcementId) {
    if (check(id).role !== "instructor")
      throw Error("Instructor access required");
    const items = news(id);
    const index = items.findIndex((a) => a.id === announcementId);
    if (index < 0) throw Error("Announcement not found");
    items.splice(index, 1);
  },
  async quizzes(id) {
    return quizzes(id);
  },
  async createQuiz(id, input) {
    if (check(id).role !== "instructor")
      throw Error("Instructor access required");
    if (
      !input.title.trim() ||
      !Number.isFinite(Date.parse(input.dueAt)) ||
      !input.questions.length ||
      input.questions.some(
        (q) =>
          !q.prompt.trim() ||
          !Number.isSafeInteger(q.points ?? 1) ||
          (q.points ?? 1) < 1 ||
          (q.kind !== "short_answer" &&
            (q.options.length < 2 ||
              q.options.some((o) => !o.trim()) ||
              new Set(q.options).size !== q.options.length)),
      )
    )
      throw Error(
        "Enter a title, due date, prompts, positive points, and distinct options for choice questions",
      );
    if (
      input.releaseGrades === "automatic" &&
      input.questions.some(
        (q) => q.kind === "short_answer" || !q.correctOptions?.length,
      )
    ) {
      throw Error(
        "Automatic release requires a correct answer for every question",
      );
    }
    const answerKey: Record<string, string[]> = Object.create(null);
    const questions = input.questions.map(({ correctOptions, ...question }) => {
      if (question.kind && question.kind !== "short_answer") {
        if (
          !correctOptions?.length ||
          (question.kind === "single_choice" && correctOptions.length !== 1) ||
          new Set(correctOptions).size !== correctOptions.length ||
          !correctOptions.every((option) => question.options.includes(option))
        ) {
          throw Error("Mark valid correct options for each choice question");
        }
        answerKey[question.id] = [...correctOptions];
      }
      return question;
    });
    const quiz: Quiz = { ...input, questions, id: crypto.randomUUID() };
    writeDemo(answerKeyKey(id, quiz.id), answerKey);
    writeDemo(quizKey(id), [...readDemo<Quiz[]>(quizKey(id), []), quiz]);
    return quiz;
  },
  async draft(id, q) {
    check(id);
    return JSON.parse(localStorage.getItem(key(id, q)) ?? "{}") as Answers;
  },
  async saveDraft(id, q, a) {
    check(id);
    localStorage.setItem(key(id, q), JSON.stringify(a));
  },
  async submit(id, q, a) {
    const quiz = quizzes(id).find((x) => x.id === q);
    if (
      !quiz ||
      quiz.questions.some((question) => {
        const answer = a[question.id];
        if (question.kind === "short_answer")
          return typeof answer !== "string" || !answer.trim();
        if (question.kind === "multiple_choice") {
          return (
            !Array.isArray(answer) ||
            !answer.length ||
            new Set(answer).size !== answer.length ||
            !answer.every((option) => question.options.includes(option))
          );
        }
        return typeof answer !== "string" || !question.options.includes(answer);
      })
    )
      throw Error("Answer every question before submitting");
    if (check(id).role !== "student") throw Error("Student access required");
    const account = activeUser();
    const records = quizRecords(id, q);
    if (records.some((record) => record.studentId === account.id))
      throw Error("You already submitted this quiz");
    const keys =
      q === "q1"
        ? { one: ["GET"], two: ["On the backend"] }
        : readDemo<Record<string, string[]>>(answerKeyKey(id, q), {});
    const marks: Record<string, number> = {};
    for (const question of quiz.questions) {
      const correct = keys[question.id];
      if (!correct) continue;
      const answer = a[question.id];
      const selected = Array.isArray(answer) ? answer : [answer];
      marks[question.id] =
        selected.length === correct.length &&
        correct.every((option) => selected.includes(option))
          ? (question.points ?? 1)
          : 0;
    }
    const record: QuizSubmissionRecord = {
      id: crypto.randomUUID(),
      studentId: account.id,
      studentName: account.name,
      submittedAt: new Date().toISOString(),
      status: "submitted",
      answers: a,
      marks,
      published:
        quiz.releaseGrades === "automatic" &&
        quiz.questions.every((question) => marks[question.id] !== undefined),
    };
    writeDemo(submissionsKey(id, q), [...records, record]);
    localStorage.removeItem(key(id, q));
    return studentReceipt(quiz, record);
  },
  async resources(id, q = "") {
    return files(id).filter((x) =>
      (x.name + " " + x.description).toLowerCase().includes(q.toLowerCase()),
    );
  },
  async searchResources(id, query) {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return files(id).flatMap((resource) => {
      const matches = (demoPages[resource.id] ?? []).filter((page) =>
        page.snippet.toLowerCase().includes(term),
      );
      return matches.length ? [{ resource, matches }] : [];
    });
  },
  async upload(id, { file, title, resourceType }) {
    await this.me();
    const role = check(id).role;
    const allowedType =
      role === "student" ? "student_note" : "instructor_material";
    if (resourceType !== allowedType)
      throw Error("Your course role cannot upload this resource type");
    if (!title.trim()) throw Error("Enter a resource title");
    validateResourceFile(file, role);
    const isPdf = /\.pdf$/i.test(file.name);
    const r: Resource = {
      id: crypto.randomUUID(),
      name: title.trim(),
      resourceType,
      description: "Available during this page session.",
      demoFile: {
        url: URL.createObjectURL(
          file.slice(
            0,
            file.size,
            isPdf ? "application/pdf" : "application/octet-stream",
          ),
        ),
        name: file.name,
        previewable: isPdf,
      },
      status: isPdf ? "processing" : "listed",
      createdAt: new Date().toISOString(),
    };
    files(id).unshift(r);
    return r;
  },
  async adminUsers() {
    if (activeUser().systemRole !== "admin")
      throw Error("Administrator access required");
    return [user, student];
  },
};

function quizRecords(courseId: string, quizId: string) {
  const example =
    courseId === "cloud"
      ? cloudQuizExamples.find(({ quiz }) => quiz.id === quizId)
      : undefined;
  return readDemo<QuizSubmissionRecord[]>(
    submissionsKey(courseId, quizId),
    example ? [example.submission] : [],
  );
}
function studentReceipt(quiz: Quiz, record: QuizSubmissionRecord) {
  const { id, submittedAt, status } = record;
  return {
    id,
    submittedAt,
    status,
    feedback: record.published ? record.feedback : undefined,
    score: record.published
      ? {
          earned: quiz.questions.reduce(
            (sum, q) => sum + (record.marks[q.id] ?? 0),
            0,
          ),
          possible: quiz.questions.reduce((sum, q) => sum + (q.points ?? 1), 0),
          manualPending: 0,
        }
      : undefined,
  };
}

export const demoQuizReview = {
  mine(courseId: string, quiz: Quiz) {
    if (check(courseId).role !== "student")
      throw Error("Student access required");
    const record = quizRecords(courseId, quiz.id).find(
      (item) => item.studentId === activeUser().id,
    );
    return record ? studentReceipt(quiz, record) : null;
  },
  list(courseId: string, quizId: string) {
    if (check(courseId).role !== "instructor")
      throw Error("Instructor access required");
    return quizRecords(courseId, quizId);
  },
  save(
    courseId: string,
    quizId: string,
    submissionId: string,
    manualMarks: Record<string, number>,
    feedback: string,
  ) {
    const records = this.list(courseId, quizId);
    const quiz = quizzes(courseId).find((item) => item.id === quizId);
    const submission = records.find((item) => item.id === submissionId);
    if (!quiz || !submission) throw Error("Submission not found");
    if (submission.published)
      throw Error("This grade has already been published");
    const marks = { ...submission.marks };
    for (const question of quiz.questions) {
      if (question.kind !== "short_answer") continue;
      const mark = manualMarks[question.id];
      if (mark === undefined) continue;
      if (!Number.isFinite(mark) || mark < 0 || mark > (question.points ?? 1)) {
        throw Error(
          "Each manual score must be within the question's point value",
        );
      }
      marks[question.id] = mark;
    }
    writeDemo(
      submissionsKey(courseId, quizId),
      records.map((item) =>
        item.id === submissionId ? { ...item, marks, feedback } : item,
      ),
    );
  },
  publish(courseId: string, quizId: string) {
    const records = this.list(courseId, quizId);
    const quiz = quizzes(courseId).find((item) => item.id === quizId);
    if (!quiz || quiz.releaseGrades === "automatic")
      throw Error("This quiz does not use manual release");
    const pending = records.filter((record) => !record.published);
    if (!pending.length) throw Error("There are no unpublished grades");
    if (
      pending.some((record) =>
        quiz.questions.some(
          (question) => record.marks[question.id] === undefined,
        ),
      )
    ) {
      throw Error("Save scores for every submission before publishing grades.");
    }
    writeDemo(
      submissionsKey(courseId, quizId),
      records.map((record) => ({ ...record, published: true })),
    );
  },
};
