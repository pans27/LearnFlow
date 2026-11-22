import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const original = globalThis.fetch;
const calls = [];
let replies = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, ...options });
  const reply = replies.shift();
  assert.ok(reply, `Unexpected request ${url}`);
  return reply;
};
const row = {
  id: 10,
  title: "Fixture quiz",
  dueAt: "2026-12-01T20:00:00Z",
  opensAt: null,
  status: "published",
  showResults: false,
  questions: [
    {
      id: 11,
      type: "multiple_choice",
      prompt: "Single",
      options: ["A", "B"],
      points: 2,
      allowMultiple: false,
    },
    {
      id: 12,
      type: "multiple_choice",
      prompt: "Multiple",
      options: ["X", "Y"],
      points: 3,
      allowMultiple: true,
    },
    {
      id: 13,
      type: "short_answer",
      prompt: "Explain",
      options: null,
      points: 5,
      allowMultiple: false,
    },
  ],
};
const attempt = {
  id: 20,
  studentId: 2,
  student: { name: "Fixture student" },
  status: "submitted",
  answers: { 11: ["A"], 12: ["X", "Y"], 13: "Explanation" },
  score: null,
  questionMarks: null,
  feedback: null,
  submittedAt: "2026-11-21T10:00:00Z",
};
const json = (data) => Response.json(data);
try {
  const { liveQuizzes: api, quizFromApi } = await server.ssrLoadModule(
    "/src/services/quizzes.ts",
  );
  const quiz = quizFromApi(row);
  assert.deepEqual(
    quiz.questions.map((q) => q.kind),
    ["single_choice", "multiple_choice", "short_answer"],
  );
  replies = [json(row), json(attempt)];
  const submitted = await api.submit("1", "10", {
    11: "A",
    12: ["X", "Y"],
    13: "Explanation",
  });
  assert.deepEqual(JSON.parse(calls.at(-1).body).answers, attempt.answers);
  assert.equal(submitted.score, undefined);
  replies = [json(row), json({ ...attempt, status: "draft" })];
  assert.equal((await api.draft("1", "10"))[11], "A");
  replies = [json(row), json(attempt)];
  await api.saveDraft("1", "10", { 11: "A" });
  assert.equal(calls.at(-1).method, "PUT");
  replies = [
    json([
      {
        ...attempt,
        score: 10,
        questionMarks: { 11: { mark: 2 }, 12: { mark: 3 }, 13: { mark: 5 } },
        feedback: "Good",
      },
    ]),
  ];
  const result = await api.mine("1", { ...quiz, showResults: true });
  assert.equal(result.score.earned, 10);
  assert.equal(result.feedback, "Good");
  replies = [json(attempt)];
  await api.grade("1", quiz, "20", { 11: 2, 12: 3, 13: 5 }, "Good");
  assert.deepEqual(JSON.parse(calls.at(-1).body).grades[2], {
    questionId: 13,
    mark: 5,
  });
  replies = [json([attempt])];
  await assert.rejects(api.publish("1", quiz), /every question/);
  replies = [
    json([
      {
        ...attempt,
        questionMarks: { 11: { mark: 2 }, 12: { mark: 3 }, 13: { mark: 5 } },
      },
    ]),
    json({ ...row, showResults: true }),
  ];
  await api.publish("1", quiz);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { showResults: true });
  replies = [
    json([
      {
        ...attempt,
        score: 0,
        questionMarks: { 11: { mark: 0 }, 12: { mark: 0 }, 13: { mark: 0 } },
        feedback: "Review the material.",
      },
    ]),
  ];
  const zeroResult = await api.mine("1", { ...quiz, showResults: true });
  assert.equal(zeroResult.score.earned, 0);
  assert.equal(zeroResult.score.possible, 10);
  replies = [json([])];
  assert.equal(await api.mine("1", quiz), null);
  replies = [json([attempt])];
  assert.equal((await api.mine("1", quiz)).score, undefined);
  const { readQuestionMarks } = await server.ssrLoadModule(
    "/src/lib/quiz-grading.ts",
  );
  const gradeForm = new FormData();
  const gradedQuestions = [
    { id: "1", prompt: "Explain", options: [], points: 8 },
  ];
  gradeForm.set("1", "9");
  assert.throws(
    () => readQuestionMarks(gradedQuestions, gradeForm),
    /Question 1: enter a score between 0 and 8/,
  );
  gradeForm.set("1", "-1");
  assert.throws(
    () => readQuestionMarks(gradedQuestions, gradeForm),
    /between 0 and 8/,
  );
  gradeForm.set("1", "0");
  assert.deepEqual(readQuestionMarks(gradedQuestions, gradeForm), { 1: 0 });
  gradeForm.set("1", "8");
  assert.deepEqual(readQuestionMarks(gradedQuestions, gradeForm), { 1: 8 });
  gradeForm.set("1", "1.234");
  assert.throws(
    () => readQuestionMarks(gradedQuestions, gradeForm),
    /two decimal places/,
  );
  const input = {
    title: "New",
    dueAt: row.dueAt,
    releaseGrades: "manual",
    questions: [
      {
        id: "local",
        kind: "single_choice",
        prompt: "Choose",
        points: 2,
        options: ["A", "B"],
        correctOptions: ["A"],
      },
    ],
  };
  replies = [
    json({ ...row, id: 30, status: "draft" }),
    json({ id: 31 }),
    json({ ...row, status: "draft" }),
  ];
  const before = calls.length;
  await api.create("1", input);
  const createdCalls = calls.slice(before);
  assert.equal(JSON.parse(createdCalls[0].body).status, "draft");
  assert.deepEqual(JSON.parse(createdCalls[1].body).answerKey, ["A"]);
  assert.equal(createdCalls.length, 3);
  assert.equal(
    createdCalls.some((call) => call.method === "PATCH"),
    false,
  );
  assert.equal(JSON.parse(createdCalls[0].body).maxAttempts, 1);
  replies = [json(row)];
  await api.publishQuiz("1", "10");
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    status: "published",
    isVisible: true,
  });
  replies = [
    json({ ...row, id: 30 }),
    Response.json({ message: "Question rejected" }, { status: 400 }),
    new Response(null, { status: 204 }),
  ];
  await assert.rejects(api.create("1", input), /Question rejected/);
  assert.equal(calls.at(-1).method, "DELETE");
  const multiRow = {
    ...row,
    maxAttempts: 3,
    questions: row.questions.map((q) => ({
      ...q,
      answerKey: q.id === 11 ? ["A"] : q.id === 12 ? ["X", "Y"] : null,
    })),
  };
  const multiQuiz = quizFromApi(multiRow);
  assert.equal(multiQuiz.maxAttempts, 3);
  assert.deepEqual(multiQuiz.questions[0].correctOptions, ["A"]);
  assert.equal(quizFromApi(row).maxAttempts, 1);
  replies = [
    json([
      { ...attempt, id: 23, status: "draft", attemptNumber: 3 },
      { ...attempt, id: 22, attemptNumber: 2, score: 0 },
      { ...attempt, id: 21, attemptNumber: 1, score: 10 },
    ]),
  ];
  const history = await api.attempts("1", multiQuiz);
  assert.equal(history.length, 3);
  assert.equal(history[0].attemptState, "draft");
  assert.equal(history[1].attemptNumber, 2);
  assert.equal(history[1].score.earned, 0);
  assert.equal(history[2].score.earned, 10);
  const updateInput = {
    ...input,
    maxAttempts: 3,
    questions: [
      { ...input.questions[0], id: "11" },
      { ...input.questions[0], id: "new-question", prompt: "New" },
    ],
  };
  replies = [
    json(multiRow),
    json({ id: 11 }),
    json({ id: 14 }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 204 }),
    json({ ...multiRow, status: "draft" }),
  ];
  const updateStart = calls.length;
  await api.updateDraft("1", { ...multiQuiz, status: "draft" }, updateInput);
  const updates = calls.slice(updateStart);
  assert.equal(JSON.parse(updates[0].body).maxAttempts, 3);
  assert.ok(
    updates.some(
      (call) => call.method === "PATCH" && call.url.endsWith("/questions/11"),
    ),
  );
  assert.ok(
    updates.some(
      (call) => call.method === "POST" && call.url.endsWith("/questions"),
    ),
  );
  assert.equal(updates.filter((call) => call.method === "DELETE").length, 2);
  assert.ok(
    !updates.some(
      (call) => call.body && JSON.parse(call.body).status === "published",
    ),
  );
  await assert.rejects(
    api.updateDraft("1", multiQuiz, updateInput),
    /Only draft quizzes/,
  );
  replies = [new Response(null, { status: 204 })];
  await api.remove("1", "10");
  assert.equal(calls.at(-1).method, "DELETE");
  assert.ok(calls.at(-1).url.endsWith("/courses/1/quizzes/10"));
  for (const status of [403, 409]) {
    replies = [Response.json({ message: "Deletion rejected" }, { status })];
    await assert.rejects(
      api.remove("1", "10"),
      (error) => error.status === status,
    );
  }
  replies = [new Response(null, { status: 204 })];
  await api.removeQuestion("1", "10", "11");
  assert.equal(calls.at(-1).method, "DELETE");
  assert.ok(calls.at(-1).url.endsWith("/quizzes/10/questions/11"));
  replies = [
    Response.json(
      { message: "Questions cannot change after an attempt has started" },
      { status: 409 },
    ),
  ];
  await assert.rejects(
    api.removeQuestion("1", "10", "11"),
    (error) => error.status === 409,
  );
  assert.equal(replies.length, 0);
  console.log(
    "PASS: real quiz question/answer mapping, hidden/released grades, draft, creation cleanup, manual grading and whole-quiz publication.",
  );
} finally {
  globalThis.fetch = original;
  await server.close();
}
