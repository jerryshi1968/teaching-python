import assert from 'node:assert/strict';
import test from 'node:test';
import { PythonRunner, RunnerError } from '../runner/src/runner.mjs';

function waitFor(runner, id) {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const task = runner.get(id);
      if (task.status !== 'queued' && task.status !== 'running') {
        clearInterval(timer);
        resolve(task);
      }
    }, 1);
  });
}

test('runner queues immutable snapshots and preserves stdout and stderr separately', async () => {
  const observed = [];
  const runner = new PythonRunner({ execute: async ({ source, stdin, onOutput }) => {
    observed.push({ source, stdin });
    onOutput({ stream: 'stdout', text: 'hello\\n' });
    onOutput({ stream: 'stderr', text: 'warning\\n' });
    return { exitCode: 0, stdout: 'hello\\n', stderr: 'warning\\n', outputLimited: false };
  } });
  const submitted = runner.submit({ id: 'run_1', source: 'print(input())', stdin: 'Ada' });
  const finished = await waitFor(runner, submitted.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.stdout, 'hello\\n');
  assert.equal(finished.stderr, 'warning\\n');
  assert.deepEqual(observed, [{ source: 'print(input())', stdin: 'Ada' }]);
});

test('runner rejects oversized source and stdin before enqueueing', () => {
  const runner = new PythonRunner({ execute: async () => ({ exitCode: 0 }) });
  assert.throws(() => runner.submit({ source: 'x'.repeat(64 * 1024 + 1) }), (error) => error instanceof RunnerError && error.code === 'invalid_source');
  assert.throws(() => runner.submit({ source: '', stdin: 'x'.repeat(16 * 1024 + 1) }), (error) => error instanceof RunnerError && error.code === 'invalid_stdin');
});

test('runner cancels a queued job without running it', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const executed = [];
  const runner = new PythonRunner({ execute: async ({ source }) => {
    executed.push(source);
    await gate;
    return { exitCode: 0, stdout: '', stderr: '', outputLimited: false };
  } });
  const first = runner.submit({ id: 'run_1', source: 'first' });
  const second = runner.submit({ id: 'run_2', source: 'second' });
  runner.stop(second.id);
  release();
  await waitFor(runner, first.id);
  assert.equal(runner.get(second.id).status, 'cancelled');
  assert.deepEqual(executed, ['first']);
});

test('runner reports a time limit when its deadline aborts a running task', async () => {
  const runner = new PythonRunner({
    limits: { sourceBytes: 64 * 1024, stdinBytes: 16 * 1024, outputBytes: 64 * 1024, timeoutMs: 1 },
    execute: async ({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ exitCode: 137, stdout: '', stderr: '', outputLimited: false }), { once: true }))
  });
  const task = await waitFor(runner, runner.submit({ id: 'run_1', source: 'while True: pass' }).id);
  assert.equal(task.status, 'time_limit');
});