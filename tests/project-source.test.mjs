import assert from 'node:assert/strict';
import test from 'node:test';
import { addProjectFile, deleteProjectFile, normalizeProjectSource, renameProjectFile, updateFileContent } from '../frontend/src/project-source.mjs';

test('front-end source helpers normalize legacy projects and edit multiple files', () => {
  let snapshot = normalizeProjectSource({ source: 'print(1)\n', stdin: 'Ada' });
  snapshot = addProjectFile(snapshot, 'helpers/message.py');
  snapshot = updateFileContent(snapshot, 'helpers/message.py', "message = 'hello'\n");
  snapshot = renameProjectFile(snapshot, 'helpers/message.py', 'lib/message.py');
  assert.equal(snapshot.files.find((file) => file.path === 'lib/message.py').content, "message = 'hello'\n");
  assert.equal(snapshot.stdin, 'Ada');
  snapshot = deleteProjectFile(snapshot, 'main.py');
  assert.equal(snapshot.entrypoint, 'lib/message.py');
});

test('front-end source helpers reject unsafe and conflicting paths', () => {
  const snapshot = normalizeProjectSource({ source: '' });
  assert.throws(() => addProjectFile(snapshot, '../secret.py'));
  assert.throws(() => addProjectFile(snapshot, 'Main.py'));
  assert.throws(() => addProjectFile(snapshot, 'main.py/helpers.py'));
});
