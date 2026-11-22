import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const previous = globalThis.fetch;
const calls = [];
let responses = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, ...options });
  const response = responses.shift();
  assert.ok(response, `Unexpected request ${url}`);
  return response;
};
const assignment = {
  id: 10,
  courseId: 1,
  title: "Assignment",
  description: "Explain",
  dueAt: "2026-12-01T20:00:00Z",
  maxMark: 10,
  isVisible: true,
  allowResubmission: false,
  gradesVisible: false,
};
const submission = {
  id: 20,
  studentId: 2,
  student: { id: 2, name: "Student", email: "student@example.test" },
  mark: null,
  originalFilename: "answer.pdf",
  submittedAt: "2026-11-21T20:00:00Z",
};
const json = (value) => Response.json(value);
try {
  const { assignmentsApi: api } = await server.ssrLoadModule(
    "/src/services/assignments.ts",
  );
  responses = [json([assignment])];
  assert.equal((await api.list("1"))[0].id, 10);
  responses = [json(assignment)];
  await api.create("1", {
    title: assignment.title,
    description: assignment.description,
    dueAt: assignment.dueAt,
    maxMark: 10,
    isVisible: true,
    allowResubmission: false,
  });
  assert.equal(calls.at(-1).method, "POST");
  assert.equal(JSON.parse(calls.at(-1).body).gradesVisible, false);
  assert.equal(JSON.parse(calls.at(-1).body).isVisible, false);
  responses = [json(assignment)];
  await api.publishAssignment("1", 10);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { isVisible: true });
  responses = [json(assignment)];
  await api.update("1", 10, { allowResubmission: true });
  assert.equal(calls.at(-1).method, "PATCH");
  responses = [
    Response.json({ message: "Submission not found" }, { status: 404 }),
  ];
  assert.equal(await api.mine("1", 10), null);
  responses = [
    Response.json({ message: "Assignment not found" }, { status: 404 }),
  ];
  await assert.rejects(api.mine("1", 10), (e) => e.status === 404);
  responses = [Response.json({ message: "Forbidden" }, { status: 403 })];
  await assert.rejects(api.mine("1", 10), (e) => e.status === 403);
  responses = [json(submission)];
  await api.submit(
    "1",
    10,
    new File(["%PDF-1.4"], "answer.pdf", { type: "application/pdf" }),
  );
  assert.ok(calls.at(-1).body instanceof FormData);
  assert.equal(calls.at(-1).body.get("file").name, "answer.pdf");
  assert.equal(calls.at(-1).headers, undefined);
  const count = calls.length;
  await assert.rejects(api.submit("1", 10, new File(["word"], "answer.docx")));
  assert.equal(calls.length, count);
  for (const mark of ["", "-1", "11", "NaN"]) {
    await assert.rejects(api.grade("1", assignment, 20, mark));
  }
  assert.equal(calls.length, count);
  responses = [json({ ...submission, mark: 0 })];
  await api.grade("1", assignment, 20, "0");
  assert.deepEqual(JSON.parse(calls.at(-1).body), { mark: 0 });
  responses = [json([submission])];
  await assert.rejects(api.publish("1", assignment), /every submission/);
  responses = [json([])];
  await assert.rejects(api.publish("1", assignment), /no submissions/);
  responses = [
    json([{ ...submission, mark: 0 }]),
    json({ ...assignment, gradesVisible: true }),
  ];
  await api.publish("1", assignment);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { gradesVisible: true });
  responses = [
    json({
      url: "https://example.test/answer.pdf",
      expiresAt: "2026-12-01T00:00:00Z",
    }),
  ];
  assert.equal(
    await api.download("1", 10, 20),
    "https://example.test/answer.pdf",
  );
  assert.ok(
    calls.at(-1).url.endsWith("/assignments/10/submissions/20/download"),
  );
  responses = [json({ url: "javascript:alert(1)" })];
  await assert.rejects(api.download("1", 10, 20));
  responses = [
    json({
      url: "https://example.test/preview.pdf",
      expiresAt: "2026-12-01T00:00:00Z",
    }),
  ];
  assert.equal(
    await api.preview("1", 10, 20),
    "https://example.test/preview.pdf",
  );
  assert.ok(
    calls.at(-1).url.endsWith("/assignments/10/submissions/20/preview"),
  );
  responses = [Response.json({ message: "Forbidden" }, { status: 403 })];
  await assert.rejects(
    api.preview("1", 10, 20),
    (error) => error.status === 403,
  );
  responses = [new Response(null, { status: 204 })];
  await api.remove("1", 10);
  assert.equal(calls.at(-1).method, "DELETE");
  assert.ok(calls.at(-1).url.endsWith("/assignments/10"));
  responses = [
    Response.json(
      { message: "Assignments with submissions cannot be deleted" },
      { status: 409 },
    ),
  ];
  await assert.rejects(api.remove("1", 10), (error) => error.status === 409);
  assert.equal(responses.length, 0);
  console.log(
    "PASS: assignment creation/settings, missing submissions vs authorization errors, multipart PDF submission, grade bounds/zero, publication checks and authorized download URLs.",
  );
} finally {
  globalThis.fetch = previous;
  await server.close();
}
