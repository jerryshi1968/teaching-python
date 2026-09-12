import assert from 'node:assert/strict';
import test from 'node:test';
import { createPythonApi, pollRun } from '../frontend/src/api.mjs';

test('Python API uses the fixed run and source endpoints', async () => {
  const calls = [];
  const api = createPythonApi({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: 'run_1', status: 'queued' }), { status: 202 });
  } });
  await api.saveProject('project_1', { source: 'print(1)', stdin: '', version: 1 });
  await api.startRun('project_1', { requestId: 'request_1' });
  await api.stopRun('run_1');
  assert.equal(calls[0].url, '/api/python/projects/project_1/source');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[1].url, '/api/python/projects/project_1/run');
  assert.equal(calls[2].url, '/api/python/runs/run_1/stop');
});

test('run polling ends only at a terminal status', async () => {
  const statuses = ['queued', 'running', 'completed'];
  const updates = [];
  const run = await pollRun({ getRun: async () => ({ id: 'run_1', status: statuses.shift(), stdout: '', stderr: '' }) }, 'run_1', { intervalMs: 0, onUpdate: (value) => updates.push(value.status) });
  assert.equal(run.status, 'completed');
  assert.deepEqual(updates, ['queued', 'running', 'completed']);
});