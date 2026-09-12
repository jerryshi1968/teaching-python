import assert from 'node:assert/strict';
import test from 'node:test';
import { createPythonApp } from '../backend/src/app.mjs';
import { PythonRepository } from '../backend/src/repository.mjs';
import { PythonService } from '../backend/src/service.mjs';

test('organizer routes use the Python-only backend and expose numeric group identifiers', async () => {
  const app = createPythonApp(new PythonService(new PythonRepository()));
  const actor = { id: 'student_1', role: 'student' };
  const created = await app({ actor, method: 'POST', path: '/api/python/groups', body: { name: 'Practice' } });
  assert.equal(typeof created.body.id, 'number');
  const groups = await app({ actor, method: 'GET', path: '/api/python/workspace/groups' });
  assert.equal(groups.status, 200);
  assert.equal(groups.body.groups[0].projectType, 'python');
  const renamed = await app({ actor, method: 'PATCH', path: `/api/python/groups/${created.body.id}`, body: { name: 'Renamed' } });
  assert.equal(renamed.body.name, 'Renamed');
  const deleted = await app({ actor, method: 'DELETE', path: `/api/python/groups/${created.body.id}` });
  assert.deepEqual(deleted.body, { deleted: true });
});
