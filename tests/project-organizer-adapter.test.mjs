import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectOrganizerAdapter } from '../frontend/src/project-organizer-adapter.mjs';

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

test('the Python organizer adapter implements all eight shared operations and maps server fields', async () => {
  const calls = [];
  const api = async (path, options = {}) => {
    calls.push({ path, options });
    if (path.startsWith('/workspace/groups')) return { groups: [{ id: 1, name: 'Parent', parent_id: null, sort_order: 1 }, { id: 2, name: 'Child', parent_id: 1, sort_order: 2 }] };
    if (path.startsWith('/workspace?')) return { groups: [], projects: [{ id: 'project_1', name: 'Hello', parent_id: 2, sort_order: 3 }], readOnly: false };
    if (path === '/projects') return { id: 'project_2', name: 'New project', parentId: null, position: 4 };
    if (path === '/groups') return { id: 3, name: 'New group', parentId: null, position: 5 };
    if (path.includes('/reposition')) return { id: 'project_1', name: 'Hello', parentId: null, position: 1 };
    if (path.includes('/projects/')) return { id: 'project_1', name: 'Renamed', parentId: null, position: 1 };
    if (path.includes('/groups/')) return { id: 3, name: 'Renamed group', parentId: null, position: 1 };
    throw new Error(`Unexpected path: ${path}`);
  };
  const opened = [];
  const adapter = createProjectOrganizerAdapter({ api, navigate: (id) => opened.push(id) });

  const directory = await adapter.loadDirectory({ ownerId: 9, parentId: 2 });
  assert.deepEqual(directory.breadcrumbs.map((group) => group.name), ['Parent', 'Child']);
  assert.equal(directory.projects[0].kind, 'project');
  assert.equal((await adapter.loadAllGroups({ ownerId: 9 })).length, 2);
  assert.equal((await adapter.createProject({ name: 'New project' })).kind, 'project');
  assert.equal((await adapter.createGroup({ name: 'New group' })).kind, 'group');
  assert.equal((await adapter.renameItem({ kind: 'project', id: 'project_1', name: 'Renamed' })).name, 'Renamed');
  assert.equal((await adapter.repositionItem({ kind: 'project', id: 'project_1', parentId: null, beforeId: null })).repositioned, true);
  assert.deepEqual(await adapter.deleteItem({ kind: 'group', id: 3 }), { deleted: true });
  adapter.openProject('project_1');
  assert.deepEqual(opened, ['project_1']);
  assert.ok(calls.every((call) => call.path.startsWith('/')));
});

test('the Python API client sends its independent language choice and preserves server errors', async () => {
  const { createApiClient, ApiError } = await import('../frontend/src/api.mjs');
  const api = createApiClient({ fetchImpl: async (_url, options) => {
    assert.equal(options.headers['Accept-Language'], 'en');
    return response({ code: 'VERSION_CONFLICT', message: 'Conflict' }, false, 409);
  }, getLanguage: () => 'en' });
  await assert.rejects(() => api('/projects/project_1'), (error) => error instanceof ApiError && error.status === 409 && error.code === 'VERSION_CONFLICT');
});
