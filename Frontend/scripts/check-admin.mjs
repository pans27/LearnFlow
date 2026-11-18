import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
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
  const { adminApi } = await server.ssrLoadModule("/src/services/admin.ts");
  const account = {
    id: 8,
    name: "Test Student",
    email: "student@example.test",
    isAdmin: false,
    mustChangePassword: true,
  };
  response = Response.json(
    { user: account, temporaryPassword: "fixture-only" },
    { status: 201 },
  );
  const created = await adminApi.createUser({
    name: account.name,
    email: account.email,
    isAdmin: false,
  });
  assert.equal(created.user.id, "8");
  assert.equal(created.user.systemRole, "user");
  assert.equal(created.temporaryPassword, "fixture-only");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    name: account.name,
    email: account.email,
    isAdmin: false,
  });
  assert.equal(calls.at(-1).options.credentials, "include");
  response = Response.json([account]);
  assert.equal((await adminApi.users())[0].mustChangePassword, true);
  response = Response.json({ ...account, isAdmin: true });
  assert.equal(
    (await adminApi.updateUser("8", { name: "Test Instructor", isAdmin: true }))
      .systemRole,
    "admin",
  );
  assert.equal(calls.at(-1).options.method, "PATCH");
  const course = {
    id: 12,
    name: "Cloud Computing",
    courseCode: "ECE1779",
    description: null,
    status: "active",
  };
  const input = {
    name: course.name,
    courseCode: course.courseCode,
    description: "Course description",
  };
  response = Response.json(course, { status: 201 });
  assert.deepEqual(await adminApi.createCourse(input), {
    id: "12",
    name: course.name,
    code: course.courseCode,
    description: "",
    status: "active",
  });
  response = Response.json([course]);
  assert.equal((await adminApi.courses())[0].code, "ECE1779");
  response = Response.json(course);
  await adminApi.updateCourse("12", input);
  assert.equal(calls.at(-1).options.method, "PATCH");
  assert.ok(calls.at(-1).url.endsWith("/admin/courses/12"));
  response = Response.json({ ...course, status: "archived" });
  assert.equal(
    (await adminApi.setCourseStatus("12", "archived")).status,
    "archived",
  );
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    status: "archived",
  });
  response = Response.json({ ...course, status: "active" });
  await adminApi.setCourseStatus("12", "active");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { status: "active" });
  const enrollment = { courseId: 12, userId: 8, role: "student" };
  response = Response.json(enrollment, { status: 201 });
  assert.deepEqual(await adminApi.enroll("12", "8", "student"), {
    courseId: "12",
    userId: "8",
    role: "student",
  });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    userId: 8,
    role: "student",
  });
  await assert.rejects(adminApi.enroll("12", "bad-id", "student"));
  response = Response.json([enrollment]);
  assert.equal((await adminApi.enrollments("12"))[0].userId, "8");
  response = Response.json({ ...enrollment, role: "instructor" });
  assert.equal(
    (await adminApi.changeRole("12", "8", "instructor")).role,
    "instructor",
  );
  assert.ok(calls.at(-1).url.endsWith("/admin/courses/12/enrollments/8"));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    role: "instructor",
  });
  const bulkInput = [
    { userId: "8", role: "student" },
    { userId: "9", role: "instructor" },
  ];
  response = Response.json(
    [
      { courseId: 12, userId: 8, role: "student" },
      { courseId: 12, userId: 9, role: "instructor" },
    ],
    { status: 201 },
  );
  const added = await adminApi.enrollMany("12", bulkInput);
  assert.equal(added[1].userId, "9");
  assert.ok(calls.at(-1).url.endsWith("/admin/courses/12/enrollments/bulk"));
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), {
    enrollments: [
      { userId: 8, role: "student" },
      { userId: 9, role: "instructor" },
    ],
  });
  const callCount = calls.length;
  await assert.rejects(adminApi.enrollMany("12", []));
  await assert.rejects(
    adminApi.enrollMany(
      "12",
      Array.from({ length: 101 }, (_, index) => ({
        userId: String(index + 1),
        role: "student",
      })),
    ),
  );
  await assert.rejects(adminApi.enrollMany("12", [bulkInput[0], bulkInput[0]]));
  await assert.rejects(
    adminApi.enrollMany("12", [{ userId: "not-a-number", role: "student" }]),
  );
  assert.equal(calls.length, callCount);
  response = Response.json(
    { message: "User already enrolled" },
    { status: 409 },
  );
  await assert.rejects(
    adminApi.enrollMany("12", bulkInput),
    (error) => error.status === 409,
  );
  response = new Response(null, { status: 204 });
  await adminApi.removeMember("12", "8");
  assert.equal(calls.at(-1).options.method, "DELETE");
  response = Response.json(
    { message: "Reactivate this course before changing it" },
    { status: 409 },
  );
  await assert.rejects(
    adminApi.enroll("12", "8", "student"),
    (error) => error.status === 409 && error.message.includes("Reactivate"),
  );
  response = Response.json(
    { message: "Cannot remove the last active administrator" },
    { status: 409 },
  );
  await assert.rejects(
    adminApi.updateUser("8", { name: "Test", isAdmin: false }),
    (error) => error.status === 409,
  );
  console.log(
    "PASS: admin user provisioning/mapping, course lifecycle, numeric enrollment IDs, role updates, removal and conflicts.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
