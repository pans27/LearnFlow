import assert from "node:assert/strict";
import { createServer } from "vite";
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { getDueStatus } = await server.ssrLoadModule("/src/lib/due.ts");
  const now = Date.parse("2026-11-06T12:00:00Z");
  const due = (hours) => new Date(now + hours * 3600000).toISOString();
  assert.equal(getDueStatus(due(-1), now).label, "Past due");
  assert.equal(getDueStatus(due(0), now).tone, "urgent");
  assert.equal(getDueStatus(due(72), now).tone, "urgent");
  assert.equal(getDueStatus(due(72.01), now).tone, "normal");
  assert.equal(getDueStatus("invalid", now).tone, "unknown");
  const { mockApi: a, demoQuizReview: review } = await server.ssrLoadModule(
    "/src/services/mock.ts",
  );
  await assert.rejects(a.me());
  await a.login({ email: "demo@test.local", password: "demo" });
  assert.equal((await a.me()).id, "demo");
  assert.equal((await a.courses()).length, 3);
  await assert.rejects(a.course("missing"));
  await assert.rejects(a.createAnnouncement("web", { title: "x", body: "y" }));
  await a.createAnnouncement("cloud", { title: "Update", body: "Body" });
  assert.equal((await a.announcements("cloud"))[0].title, "Update");
  assert.notEqual((await a.announcements("web"))[0].title, "Update");
  const answers = { one: "GET", two: "On the backend" };
  await a.saveDraft("web", "q1", answers);
  assert.deepEqual(await a.draft("web", "q1"), answers);
  assert.deepEqual(await a.draft("cloud", "q1"), {});
  await assert.rejects(a.submit("web", "q1", {}));
  assert.equal((await a.submit("web", "q1", answers)).status, "submitted");
  assert.deepEqual(await a.draft("web", "q1"), {});
  assert.equal((await a.resources("web", "no-match")).length, 0);
  const pdf = new File(["%PDF"], "note.pdf", { type: "application/pdf" });
  const note = { file: pdf, title: "My notes", resourceType: "student_note" };
  const material = {
    ...note,
    title: "Lecture",
    resourceType: "instructor_material",
  };
  const slides = new File(["slides"], "lecture.pptx");
  await assert.rejects(a.upload("web", { ...note, file: slides }));
  const uploaded = await a.upload("cloud", { ...material, file: slides });
  assert.equal(await (await fetch(uploaded.demoFile.url)).text(), "slides");
  assert.equal(
    (
      await a.upload("cloud", {
        ...material,
        file: new File(["data"], "example.custom"),
      })
    ).status,
    "listed",
  );
  for (const extension of ["doc", "docx"]) {
    const file = new File(["demo"], "notes." + extension);
    assert.equal((await a.upload("web", { ...note, file })).status, "listed");
  }
  await assert.rejects(
    a.upload("web", { ...note, file: new File([], "empty.docx") }),
  );
  await assert.rejects(a.upload("web", material));
  await assert.rejects(a.upload("cloud", note));
  assert.equal((await a.upload("web", note)).resourceType, "student_note");
  assert.equal((await a.upload("cloud", material)).status, "processing");
  assert.ok(
    (await a.resources("web")).some((resource) => resource.name === "My notes"),
  );
  assert.ok(
    !(await a.resources("cloud")).some(
      (resource) => resource.name === "My notes",
    ),
  );
  assert.ok(
    (await a.searchResources("web", "AUTHENTICATION")).some((result) =>
      result.matches.some((match) => match.page === 2),
    ),
  );
  assert.deepEqual(await a.searchResources("web", "no-pdf-match"), []);
  const input = {
    title: "New quiz",
    dueAt: "2026-12-01T12:00:00Z",
    questions: [{ id: "new-q", prompt: "Pick one", options: ["A", "B"] }],
  };
  await assert.rejects(a.createQuiz("web", input));
  const created = await a.createQuiz("cloud", input);
  assert.ok((await a.quizzes("cloud")).some((q) => q.id === created.id));
  assert.ok(!(await a.quizzes("web")).some((q) => q.id === created.id));
  const dashboard = await a.dashboard("cloud");
  assert.ok(
    ["assignment", "quiz", "exam"].every((kind) =>
      dashboard.upcomingAssessments.some((a) => a.kind === kind),
    ),
  );
  const mixed = await a.createQuiz("cloud", {
    ...input,
    questions: [
      {
        id: "single",
        kind: "single_choice",
        correctOptions: ["A"],
        prompt: "Pick one",
        options: ["A", "B"],
        points: 2,
      },
      {
        id: "multiple",
        kind: "multiple_choice",
        correctOptions: ["A", "B"],
        prompt: "Pick both",
        options: ["A", "B"],
        points: 3,
      },
      {
        id: "written",
        kind: "short_answer",
        prompt: "Explain your choice",
        options: [],
        points: 5,
      },
    ],
  });
  assert.equal(
    mixed.questions.reduce((total, question) => total + question.points, 0),
    10,
  );
  const mixedAnswers = {
    single: "A",
    multiple: ["A", "B"],
    written: "An explanation",
  };
  const automatic = await a.createQuiz("cloud", {
    ...input,
    releaseGrades: "automatic",
    questions: [
      {
        id: "auto",
        kind: "single_choice",
        prompt: "Pick A",
        options: ["A", "B"],
        correctOptions: ["A"],
        points: 2,
      },
    ],
  });
  await assert.rejects(
    a.submit("cloud", mixed.id, mixedAnswers),
    /Student access/,
  );
  await a.login({ email: "student@learnflow.demo", password: "demo" });
  assert.equal((await a.course("cloud")).role, "student");
  assert.throws(() => review.list("cloud", mixed.id), /Instructor access/);
  await a.saveDraft("cloud", mixed.id, mixedAnswers);
  assert.deepEqual(await a.draft("cloud", mixed.id), mixedAnswers);
  await assert.rejects(
    a.submit("cloud", mixed.id, { ...mixedAnswers, multiple: ["invalid"] }),
  );
  assert.equal(
    (await a.submit("cloud", mixed.id, mixedAnswers)).score,
    undefined,
  );
  await assert.rejects(
    a.submit("cloud", mixed.id, mixedAnswers),
    /already submitted/,
  );
  assert.ok(
    mixed.questions.every((question) => !("correctOptions" in question)),
  );
  assert.deepEqual(
    (await a.submit("cloud", automatic.id, { auto: "A" })).score,
    { earned: 2, possible: 2, manualPending: 0 },
  );
  await a.login({ email: "alex@learnflow.demo", password: "demo" });
  const [record] = review.list("cloud", mixed.id);
  assert.equal(record.studentName, "Jamie Patel");
  assert.throws(
    () => review.publish("cloud", mixed.id),
    /Save scores for every submission/,
  );
  review.save(
    "cloud",
    mixed.id,
    record.id,
    { written: 4 },
    "Good explanation.",
  );
  await a.login({ email: "student@learnflow.demo", password: "demo" });
  assert.equal(review.mine("cloud", mixed).score, undefined);
  assert.equal(review.mine("cloud", mixed).feedback, undefined);
  await a.login({ email: "alex@learnflow.demo", password: "demo" });
  review.publish("cloud", mixed.id);
  await a.login({ email: "student@learnflow.demo", password: "demo" });
  assert.equal(review.mine("cloud", mixed).feedback, "Good explanation.");
  assert.deepEqual(review.mine("cloud", mixed).score, {
    earned: 9,
    possible: 10,
    manualPending: 0,
  });
  const examples = await a.quizzes("cloud");
  const autoExample = examples.find((quiz) => quiz.id === "demo-auto-release");
  const manualExample = examples.find(
    (quiz) => quiz.id === "demo-manual-release",
  );
  assert.equal(review.mine("cloud", autoExample).score.earned, 4);
  assert.equal(review.mine("cloud", manualExample).score, undefined);
  assert.ok(
    !(await a.quizzes("web")).some((quiz) => quiz.id === autoExample.id),
  );
  await a.login({ email: "alex@learnflow.demo", password: "demo" });
  const [exampleRecord] = review.list("cloud", manualExample.id);
  review.save(
    "cloud",
    manualExample.id,
    exampleRecord.id,
    { design: 5 },
    "Good work.",
  );
  review.publish("cloud", manualExample.id);
  await a.login({ email: "student@learnflow.demo", password: "demo" });
  assert.equal(review.mine("cloud", manualExample).score.earned, 9);
  await a.logout();
  await assert.rejects(a.me());
  console.log(
    "PASS: auth, course isolation, instructor authorization, draft restore/clear, submission validation, search, resource file validation and mock upload.",
  );
} finally {
  await server.close();
}
