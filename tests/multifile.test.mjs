import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MemorySourceStore, SourceStore } from '../backend/src/source-store.mjs';
import { validateSnapshot } from '../backend/src/validation.mjs';
import { PythonRepository } from '../backend/src/repository.mjs';
import { PythonService } from '../backend/src/service.mjs';

const snapshot = {
  schemaVersion: 2,
  entrypoint: 'src/main.py',
  files: [
    { path: 'src/main.py', content: 'from helpers.message import value\nprint(value)\n' },
    { path: 'helpers/message.py', content: "value = 'multi-file'\n" },
    { path: 'data/message.txt', content: 'hello\n' }
  ],
  stdin: ''
};

test('validates and sorts a Python multi-file snapshot', () => {
  const result = validateSnapshot(snapshot);
  assert.deepEqual(result.files.map((file) => file.path), ['data/message.txt', 'helpers/message.py', 'src/main.py']);
  assert.equal(result.entrypoint, 'src/main.py');
});

test('normalizes the legacy single-source shape', () => {
  const result = validateSnapshot({ source: 'print(1)\n', stdin: '' });
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.entrypoint, 'main.py');
  assert.deepEqual(result.files, [{ path: 'main.py', content: 'print(1)\n' }]);
});

test('rejects unsafe, duplicate, conflicting, and missing entrypoint paths', () => {
  const invalid = [
    { ...snapshot, files: [{ path: '../main.py', content: '' }], entrypoint: '../main.py' },
    { ...snapshot, files: [{ path: 'Main.py', content: '' }, { path: 'main.py', content: '' }], entrypoint: 'main.py' },
    { ...snapshot, files: [{ path: 'pkg', content: '' }, { path: 'pkg/main.py', content: '' }], entrypoint: 'pkg/main.py' },
    { ...snapshot, entrypoint: 'missing.py' }
  ];
  for (const candidate of invalid) assert.throws(() => validateSnapshot(candidate));
});

test('SourceStore writes immutable snapshots and removes them eventually', async () => {
  const root = await mkdtemp(join(tmpdir(), 'teaching-python-source-'));
  const store = new SourceStore(root);
  try {
    await store.init();
    await store.write('revision-1', snapshot);
    assert.deepEqual(await store.read('revision-1'), validateSnapshot(snapshot));
    const raw = JSON.parse(await readFile(join(root, 'revision-1.json'), 'utf8'));
    assert.equal(raw.schemaVersion, 2);
    assert.equal(await store.removeEventually('revision-1'), true);
    await assert.rejects(store.read('revision-1'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('multi-file runs keep their revision and project deletion clears every snapshot', async () => {
  const sources = new MemorySourceStore();
  const repository = new PythonRepository({}, sources);
  const submitted = [];
  const service = new PythonService(repository, { submit: async (input) => submitted.push(input), get: async () => ({}), stop: async () => ({}) });
  const actor = { id: 'student_1', role: 'student' };
  const created = await service.createProject(actor, { name: 'Modules', ...snapshot });
  const firstRevision = created.revisionId;
  const run = await service.runProject(actor, created.id, { requestId: 'multi_file_run' });
  assert.equal(submitted[0].files.length, 3);
  const saved = await service.saveSource(actor, created.id, { ...snapshot, files: snapshot.files.map((file) => file.path === 'helpers/message.py' ? { ...file, content: "value = 'saved'\n" } : file), version: 1 });
  assert.notEqual(saved.revisionId, firstRevision);
  const historical = await service.runSource(actor, run.id);
  assert.equal(historical.files.find((file) => file.path === 'helpers/message.py').content, "value = 'multi-file'\n");
  assert.deepEqual(await service.delete(actor, 'project', created.id), { snapshotCleanupPending: false });
  await assert.rejects(sources.read(firstRevision), { code: 'ENOENT' });
  await assert.rejects(sources.read(saved.revisionId), { code: 'ENOENT' });
  await assert.rejects(repository.getRun(run.id));
});
