import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { PythonRunner } from '../runner/src/runner.mjs';
import { createRunnerHttpServer } from '../runner/src/server.mjs';

const token = 'a'.repeat(32);

async function createServer() {
  const runner = new PythonRunner({ execute: async () => ({ exitCode: 0, stdout: 'done\\n', stderr: '', outputLimited: false }) });
  const server = createRunnerHttpServer({ runner, token });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test('runner HTTP API requires the internal token and never returns source or stdin', async (t) => {
  const { server, url } = await createServer();
  t.after(() => server.close());
  const unauthenticated = await fetch(`${url}/runs`);
  assert.equal(unauthenticated.status, 401);
  const created = await fetch(`${url}/runs`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'run_1', source: 'print(1)', stdin: 'hidden' }) });
  assert.equal(created.status, 202);
  const task = await created.json();
  assert.equal(task.id, 'run_1');
  assert.equal('source' in task, false);
  assert.equal('stdin' in task, false);
});
