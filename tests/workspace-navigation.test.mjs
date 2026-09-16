import assert from 'node:assert/strict';
import test from 'node:test';
import { readWorkspaceNavigation, writeWorkspaceNavigation } from '../frontend/src/workspace-navigation.mjs';

test('workspace navigation reads the restored class, student, and group', () => {
  assert.deepEqual(readWorkspaceNavigation('?classId=class_1&studentId=student_2&folderId=17'), {
    classId: 'class_1',
    studentId: 'student_2',
    folderId: 17
  });
});

test('workspace navigation ignores an invalid group id', () => {
  assert.deepEqual(readWorkspaceNavigation('?classId=class_1&folderId=invalid'), {
    classId: 'class_1',
    studentId: 'me',
    folderId: null
  });
});

test('workspace navigation preserves unrelated parameters and clears default selections', () => {
  assert.equal(writeWorkspaceNavigation('?language=en&studentId=old&folderId=8', {
    classId: 'class_2',
    studentId: 'me',
    folderId: null
  }), '?language=en&classId=class_2');
});
