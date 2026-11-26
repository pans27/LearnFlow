import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const originalFetch = globalThis.fetch;
const calls = [];
let response;
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return response;
};
try {
  const { httpApi, changePassword, ApiError } = await server.ssrLoadModule(
    "/src/services/api.ts",
  );
  const account = {
    id: 7,
    name: "Test Admin",
    email: "admin@example.test",
    isAdmin: true,
    mustChangePassword: true,
  };
  response = Response.json(account);
  assert.deepEqual(await httpApi.me(), {
    id: "7",
    name: account.name,
    email: account.email,
    systemRole: "admin",
    mustChangePassword: true,
  });
  assert.equal(calls.at(-1).options.credentials, "include");
  response = Response.json({ message: "Unauthorized" }, { status: 401 });
  await assert.rejects(
    httpApi.login({ email: "test@example.test", password: "fixture-only" }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  response = Response.json([
    {
      id: 12,
      name: "Software",
      courseCode: "ECE1724",
      description: null,
      role: "student",
      status: "active",
    },
  ]);
  const [course] = await httpApi.courses();
  assert.equal(course.id, "12");
  assert.equal(course.code, "ECE1724");
  assert.equal(course.description, "");
  response = Response.json({
    recentAnnouncements: [],
    upcomingAssessments: [],
    recentResources: [],
  });
  assert.deepEqual(await httpApi.dashboard("12"), {
    announcements: [],
    upcomingAssessments: [],
    recentResources: [],
  });
  response = Response.json({
    recentAnnouncements: [],
    recentResources: [],
    upcomingAssessments: [
      {
        id: 10,
        title: "Submitted quiz",
        type: "quiz",
        dueAt: "2026-12-01T20:00:00Z",
        submissionStatus: "graded",
      },
      {
        id: 11,
        title: "Pending assignment",
        type: "assignment",
        dueAt: "2026-12-01T20:00:00Z",
        submissionStatus: "not_started",
      },
    ],
  });
  const dashboardStates = await httpApi.dashboard("12");
  assert.equal(
    dashboardStates.upcomingAssessments[0].submissionStatus,
    "graded",
  );
  assert.equal(
    dashboardStates.upcomingAssessments[1].submissionStatus,
    "not_started",
  );
  const announcement = {
    id: 31,
    courseId: 12,
    authorId: 7,
    title: "Course update",
    body: "First paragraph.\nSecond paragraph.",
    isVisible: false,
    createdAt: "2026-11-18T12:00:00Z",
  };
  const responses = [
    Response.json([announcement], { headers: { "X-Next-Cursor": "31" } }),
    Response.json([{ ...announcement, id: 30, isVisible: true }]),
  ];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return responses.shift();
  };
  const announcements = await httpApi.announcements("12");
  assert.deepEqual(
    announcements.map((a) => a.id),
    ["31", "30"],
  );
  assert.equal(announcements[0].isVisible, false);
  assert.equal(announcements[0].body, announcement.body);
  assert.ok(calls.at(-1).url.endsWith("?limit=100&cursor=31"));
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response;
  };
  response = Response.json(announcement);
  await httpApi.createAnnouncement("12", {
    title: announcement.title,
    body: announcement.body,
    isVisible: false,
  });
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(JSON.parse(calls.at(-1).options.body).isVisible, false);
  response = Response.json(announcement);
  await httpApi.updateAnnouncement("12", "31", { isVisible: true });
  assert.ok(calls.at(-1).url.endsWith("/courses/12/announcements/31"));
  assert.equal(calls.at(-1).options.method, "PATCH");
  response = Response.json({ message: "Forbidden" }, { status: 403 });
  await assert.rejects(
    httpApi.deleteAnnouncement("12", "31"),
    (e) => e instanceof ApiError && e.status === 403,
  );
  response = new Response(null, { status: 204 });
  await httpApi.deleteAnnouncement("12", "31");
  assert.equal(calls.at(-1).options.method, "DELETE");
  response = new Response(null, { status: 204 });
  await changePassword({
    currentPassword: "fixture-old-only",
    newPassword: "fixture-new-only",
  });
  assert.ok(calls.at(-1).url.endsWith("/auth/change-password"));
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(
    JSON.parse(calls.at(-1).options.body).newPassword,
    "fixture-new-only",
  );
  await httpApi.logout();
  assert.ok(calls.at(-1).url.endsWith("/auth/logout"));
  const { resourceFileUrl } = await server.ssrLoadModule(
    "/src/services/api.ts",
  );
  const { validateBackendResourceFile } = await server.ssrLoadModule(
    "/src/lib/resource-files.ts",
  );
  const pdf = new File(["%PDF-1.4 fixture"], "fixture.pdf", {
    type: "application/pdf",
  });
  validateBackendResourceFile(pdf);
  assert.throws(() =>
    validateBackendResourceFile(new File(["word"], "notes.docx")),
  );
  assert.throws(() => validateBackendResourceFile(new File([], "empty.pdf")));
  response = Response.json({
    id: 42,
    title: "Lecture",
    resourceType: "instructor_material",
    extractionStatus: "pending",
  });
  const uploaded = await httpApi.upload("12", {
    file: pdf,
    title: "Lecture",
    resourceType: "instructor_material",
  });
  assert.equal(uploaded.id, "42");
  assert.equal(uploaded.status, "pending");
  assert.ok(calls.at(-1).options.body instanceof FormData);
  assert.equal(calls.at(-1).options.body.get("title"), "Lecture");
  assert.equal(calls.at(-1).options.headers, undefined);
  for (const action of ["preview", "download"]) {
    response = Response.json({
      url: "https://example.test/file.pdf",
      expiresAt: "2026-11-20T20:00:00Z",
    });
    assert.equal(
      (await resourceFileUrl("12", "42", action)).url,
      "https://example.test/file.pdf",
    );
    assert.ok(calls.at(-1).url.endsWith(`/courses/12/resources/42/${action}`));
    assert.equal(calls.at(-1).options.credentials, "include");
  }
  response = Response.json({ url: "javascript:alert(1)" });
  await assert.rejects(resourceFileUrl("12", "42", "preview"));
  response = Response.json({ message: "Forbidden" }, { status: 403 });
  await assert.rejects(
    resourceFileUrl("12", "42", "download"),
    (e) => e.status === 403,
  );
  const { deleteResource } = await server.ssrLoadModule("/src/services/api.ts");
  response = new Response(null, { status: 204 });
  await deleteResource("12", "42");
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.ok(calls.at(-1).url.endsWith("/courses/12/resources/42"));
  response = Response.json({ message: "Forbidden" }, { status: 403 });
  await assert.rejects(
    deleteResource("12", "42"),
    (error) => error.status === 403,
  );
  console.log(
    "PASS: resource upload multipart payload, numeric IDs, PDF validation, preview/download links and authorization errors.",
  );
  console.log(
    "PASS: backend user/course mapping, cookie credentials, auth errors, password-change payload, 204, logout, announcement pagination/mapping/create/edit/delete and permission errors.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
