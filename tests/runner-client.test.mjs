import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunnerClient } from '../backend/src/runner-client.mjs';
import { AppError } from '../backend/src/errors.mjs';

const token = 'b'.repeat(32);

test('runner client only calls the loopback endpoint with the internal token', async () => {
  const requests = [];
  const client = createRunnerClient({
    baseUrl: 'http://127.0.0.1:5182',
    token,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(JSON.stringify({ id: 'run_1', status: 'queued' }), { status: 202 });
    }
  });
  const result = await client.submit({ id: 'run_1', source: 'print(1)', stdin: '' });
  assert.equal(result.status, 'queued');
  assert.equal(requests[0].url, 'http://127.0.0.1:5182/runs');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${token}`);
});

test('runner client rejects non-loopback endpoints and maps outages to a safe error', async () => {
  assert.throws(() => createRunnerClient({ baseUrl: 'http://example.com:5182', token }), /loopback/);
  const client = createRunnerClient({ baseUrl: 'http://127.0.0.1:5182', token, fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => client.get('run_1'), (error) => error instanceof AppError && error.status === 503 && error.code === 'RUNNER_UNAVAILABLE');
});