import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import app from '../src/app';
import { adminService } from '../src/services/admin';

test('admin routes pass named validated locals to their services', async (t) => {
  const course = { id: 1, name: 'Software', courseCode: 'ECE1724', description: null,
    status: 'active', createdAt: new Date(), updatedAt: new Date() };
  const enrollment = { courseId: 1, userId: 2, role: 'student', enrolledAt: new Date() };
  const create = t.mock.method(adminService, 'createCourse', async () => course);
  const update = t.mock.method(adminService, 'updateCourse', async () => course);
  const status = t.mock.method(adminService, 'setCourseStatus', async () => ({ ...course, status: 'archived' }));
  const enroll = t.mock.method(adminService, 'createEnrollment', async () => enrollment);
  const bulkAdd = t.mock.method(adminService, 'createEnrollments', async () => [enrollment]);
  const bulkRemove = t.mock.method(adminService, 'removeEnrollments', async () => {});
  const role = t.mock.method(adminService, 'updateEnrollment', async () => ({ ...enrollment, role: 'instructor' }));
  const user = t.mock.method(adminService, 'updateUser', async () => ({ id: 2, name: 'Alice',
    email: 'alice@example.test', isAdmin: false, mustChangePassword: false }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  // Send a JSON request to the test API and decode its response.
  const request = async (path: string, method: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? undefined : await response.json() };
  };

  const created = await request('/courses', 'POST', { name: ' Software ' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, name: 'Software', courseCode: 'ECE1724', description: null, status: 'active' });
  assert.deepEqual(create.mock.calls[0].arguments, [{ name: 'Software' }]);
  assert.equal((await request('/courses/1', 'PATCH', { description: null })).status, 200);
  assert.deepEqual(update.mock.calls[0].arguments, [1, { description: null }]);
  assert.equal((await request('/courses/1/status', 'PATCH', { status: 'archived' })).status, 200);
  assert.deepEqual(status.mock.calls[0].arguments, [1, 'archived']);
  assert.equal((await request('/courses/1/enrollments', 'POST', { userId: 2, role: 'student' })).status, 201);
  assert.deepEqual(enroll.mock.calls[0].arguments, [1, 2, 'student']);
  const added = await request('/courses/1/enrollments/bulk', 'POST', { enrollments: [{ userId: 2, role: 'student' }] });
  assert.deepEqual(added, { status: 201, body: [{ courseId: 1, userId: 2, role: 'student' }] });
  assert.deepEqual(bulkAdd.mock.calls[0].arguments, [1, { enrollments: [{ userId: 2, role: 'student' }] }]);
  assert.equal((await request('/courses/1/enrollments/bulk-remove', 'POST', { userIds: [2] })).status, 204);
  assert.deepEqual(bulkRemove.mock.calls[0].arguments, [1, { userIds: [2] }]);
  assert.equal((await request('/courses/1/enrollments/bulk', 'POST', { enrollments: [] })).status, 400);
  assert.equal(bulkAdd.mock.callCount(), 1);
  assert.equal((await request('/courses/1/enrollments/bulk-remove', 'POST', { userIds: [2, 2] })).status, 400);
  assert.equal(bulkRemove.mock.callCount(), 1);
  assert.equal((await request('/courses/1/enrollments/2', 'PATCH', { role: 'instructor' })).status, 200);
  assert.deepEqual(role.mock.calls[0].arguments, [1, 2, 'instructor']);
  assert.equal((await request('/users/2', 'PATCH', { name: ' Alice ' })).status, 200);
  assert.deepEqual(user.mock.calls[0].arguments, [2, { name: 'Alice' }]);
  assert.deepEqual(await request('/courses/invalid', 'PATCH', { name: 'x' }), {
    status: 400, body: { message: 'Invalid ID' },
  });
  assert.equal(update.mock.callCount(), 1);
});
