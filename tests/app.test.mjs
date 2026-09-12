import assert from 'node:assert/strict';
import test from 'node:test';
import { createPythonApp } from '../backend/src/app.mjs';
import { PythonRepository } from '../backend/src/repository.mjs';
import { PythonService } from '../backend/src/service.mjs';

const actor = { id: 'student_1', role: 'student' };

test('the application exposes Python-only API paths', async () => {
  const app = createPythonApp(new PythonService(new PythonRepository()));
  const created = await app({ actor, method: 'POST', path: '/api/python/projects', body: { name: 'Hello', source: 'print("hello")', stdin: '' } });
  assert.equal(created.status, 201);
  const project = await app({ actor, method: 'GET', path: `/api/python/projects/${created.body.id}` });
  assert.equal(project.status, 200);
  const foreign = await app({ actor, method: 'GET', path: `/api/cpp/projects/${created.body.id}` });
  assert.equal(foreign.status, 404);
});

test('the application rejects unauthenticated requests', async () => {
  const app = createPythonApp(new PythonService(new PythonRepository()));
  const response = await app({ method: 'GET', path: '/api/python/workspace' });
  assert.deepEqual(response, { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
});

test('the backend submits an immutable saved snapshot to the runner without executing Python itself', async () => {
  const submitted = [];
  const runnerGateway = {
    submit: async (run) => { submitted.push(run); },
    get: async (id) => ({ id, status: 'completed', stdout: 'first\n', stderr: '' }),
    stop: async (id) => ({ id, status: 'cancelled' })
  };
  const app = createPythonApp(new PythonService(new PythonRepository(), runnerGateway));
  const created = await app({ actor, method: 'POST', path: '/api/python/projects', body: { name: 'Snapshot', source: 'print("first")', stdin: 'Ada' } });
  const queued = await app({ actor, method: 'POST', path: `/api/python/projects/${created.body.id}/run`, body: { requestId: 'request_1' } });
  assert.equal(queued.status, 202);
  await app({ actor, method: 'PUT', path: `/api/python/projects/${created.body.id}/source`, body: { source: 'print("second")', stdin: '', version: 1 } });
  assert.deepEqual(submitted[0], { id: queued.body.id, source: 'print("first")', stdin: 'Ada' });
  const snapshot = await app({ actor, method: 'GET', path: `/api/python/runs/${queued.body.id}/source` });
  assert.deepEqual(snapshot.body, { source: 'print("first")', stdin: 'Ada', version: 1 });
  const result = await app({ actor, method: 'GET', path: `/api/python/runs/${queued.body.id}` });
  assert.equal(result.body.status, 'completed');
  assert.equal(result.body.stdout, 'first\n');
  assert.equal('source' in result.body, false);
});
test('teachers can list only their classes and enrolled students', async () => {
  const teacher = { id: 'teacher_1', role: 'teacher' };
  const student = { id: 'student_1', role: 'student' };
  const app = createPythonApp(new PythonService(new PythonRepository({ classes: [{ id: 'class_1', teacherId: teacher.id, name: 'Python A' }], enrollments: [{ classId: 'class_1', studentId: student.id }] })));
  const classes = await app({ actor: teacher, method: 'GET', path: '/api/python/classes' });
  assert.equal(classes.body.classes[0].name, 'Python A');
  const students = await app({ actor: teacher, method: 'GET', path: '/api/python/classes/class_1/students' });
  assert.equal(students.body.students[0].studentId, student.id);
  const forbidden = await app({ actor: student, method: 'GET', path: '/api/python/classes' });
  assert.equal(forbidden.status, 403);
});
test('teacher distribution creates one independent Python copy per enrolled student and is idempotent', async () => {
  const teacher = { id: 'teacher_1', role: 'teacher' };
  const app = createPythonApp(new PythonService(new PythonRepository({ classes: [{ id: 'class_1', teacherId: teacher.id }], enrollments: [{ classId: 'class_1', studentId: 'student_1' }, { classId: 'class_1', studentId: 'student_2' }] })));
  const project = await app({ actor: teacher, method: 'POST', path: '/api/python/projects', body: { name: 'Lesson', source: 'print(1)', stdin: '' } });
  const first = await app({ actor: teacher, method: 'POST', path: `/api/python/projects/${project.body.id}/distribute`, body: { classId: 'class_1', requestId: 'distribution_1' } });
  const second = await app({ actor: teacher, method: 'POST', path: `/api/python/projects/${project.body.id}/distribute`, body: { classId: 'class_1', requestId: 'distribution_1' } });
  assert.equal(first.status, 201);
  assert.equal(first.body.projects.length, 2);
  assert.deepEqual(second.body.projects.map((item) => item.id), first.body.projects.map((item) => item.id));
  assert.equal(first.body.projects[0].projectType, 'python');
});