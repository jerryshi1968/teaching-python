import assert from 'node:assert/strict';
import test from 'node:test';
import { PythonRepository } from '../backend/src/repository.mjs';
import { PythonService } from '../backend/src/service.mjs';
import { AppError } from '../backend/src/errors.mjs';

const student = { id: 'student_1', role: 'student' };
const otherStudent = { id: 'student_2', role: 'student' };
const teacher = { id: 'teacher_1', role: 'teacher' };

function createService() {
  return new PythonService(new PythonRepository({
    projects: [{ id: 'cpp_project', ownerId: student.id, name: 'C++ only', parentId: null, projectType: 'cpp', version: 1, source: '', stdin: '' }],
    groups: [{ id: 'p5_group', ownerId: student.id, name: 'p5 only', parentId: null, projectType: 'p5js' }],
    classes: [{ id: 'class_1', teacherId: teacher.id }],
    enrollments: [{ classId: 'class_1', studentId: student.id }]
  }));
}

test('Python workspace never returns records from another teaching tool', async () => {
  const service = createService();
  const workspace = await service.workspace(student, student.id);
  assert.deepEqual(workspace.groups, []);
  assert.deepEqual(workspace.projects, []);
});

test('students can create nested Python groups and projects', async () => {
  const service = createService();
  const group = await service.createGroup(student, { name: 'Loops' });
  const project = await service.createProject(student, { name: 'Counting', parentId: group.id, source: 'print(1)', stdin: '' });
  const workspace = await service.workspace(student, student.id, group.id);
  assert.equal(project.projectType, 'python');
  assert.equal(workspace.projects[0].id, project.id);
});

test('cross-user moves are hidden as not found and cannot change data', async () => {
  const service = createService();
  const project = await service.createProject(student, { name: 'Private' });
  await assert.rejects(() => service.move(otherStudent, 'project', project.id, null), (error) => error instanceof AppError && error.code === 'NOT_FOUND');
  assert.equal((await service.project(student, project.id)).ownerId, student.id);
});

test('a group cannot be moved into itself or a descendant', async () => {
  const service = createService();
  const parent = await service.createGroup(student, { name: 'Parent' });
  const child = await service.createGroup(student, { name: 'Child', parentId: parent.id });
  await assert.rejects(() => service.move(student, 'group', parent.id, child.id), (error) => error instanceof AppError && error.code === 'INVALID_GROUP_MOVE');
});

test('saving unchanged source does not create a version and conflicts preserve the server version', async () => {
  const service = createService();
  const project = await service.createProject(student, { name: 'Versioned', source: 'print(1)', stdin: '' });
  const unchanged = await service.saveSource(student, project.id, { source: 'print(1)', stdin: '', version: 1 });
  assert.equal(unchanged.version, 1);
  const saved = await service.saveSource(student, project.id, { source: 'print(2)', stdin: '', version: 1 });
  assert.equal(saved.version, 2);
  await assert.rejects(() => service.saveSource(student, project.id, { source: 'print(3)', stdin: '', version: 1 }), (error) => error instanceof AppError && error.code === 'VERSION_CONFLICT');
  assert.equal((await service.project(student, project.id)).source, 'print(2)');
});

test('a responsible teacher sees students read-only while other students see no record', async () => {
  const service = createService();
  const project = await service.createProject(student, { name: 'Student work' });
  const teacherView = await service.project(teacher, project.id);
  assert.equal(teacherView.readOnly, true);
  await assert.rejects(() => service.project(otherStudent, project.id), (error) => error instanceof AppError && error.code === 'NOT_FOUND');
});

test('copying a student project makes a separate teacher-owned Python project', async () => {
  const service = createService();
  const project = await service.createProject(student, { name: 'Student work', source: 'print("hi")' });
  const copied = await service.copyToMine(teacher, project.id);
  assert.notEqual(copied.id, project.id);
  assert.equal(copied.ownerId, teacher.id);
  assert.equal(copied.projectType, 'python');
  assert.equal(copied.source, 'print("hi")');
});

test('each project retains only its 20 most recent runs', async () => {
  const repository = new PythonRepository();
  const project = await repository.createProject({ ownerId: student.id, name: 'History' });
  for (let index = 0; index < 22; index++) await repository.createRun({ project, ownerId: student.id, requestId: `history_${index}` });
  const runs = await repository.listRuns(project.id);
  assert.equal(runs.length, 20);
  assert.equal(runs[0].requestId, 'history_21');
  assert.equal(runs.at(-1).requestId, 'history_2');
});