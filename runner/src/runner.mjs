import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const RUNNER_LIMITS = Object.freeze({
  sourceBytes: 64 * 1024,
  stdinBytes: 16 * 1024,
  outputBytes: 64 * 1024,
  timeoutMs: 3_000,
  memory: '256m',
  cpus: '1',
  pids: 64,
  nofile: 64
});

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function validateRunInput({ source, stdin = '' }, limits) {
  if (typeof source !== 'string' || byteLength(source) > limits.sourceBytes) throw new RunnerError('invalid_source', 'Python source must be text within the source limit.');
  if (typeof stdin !== 'string' || byteLength(stdin) > limits.stdinBytes) throw new RunnerError('invalid_stdin', 'Standard input must be text within the input limit.');
}

function normalizeText(value, workDirectory) {
  return value.replaceAll(workDirectory, '/work').replaceAll('/work/main.py', 'main.py');
}

export class RunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createPodmanExecutor({ podmanPath = 'podman', image, tempRoot, limits = RUNNER_LIMITS }) {
  if (!image) throw new Error('A fixed runner image is required.');
  if (!tempRoot) throw new Error('A private runner temporary directory is required.');

  return async function execute({ id, source, stdin, signal, onOutput }) {
    const workDirectory = await mkdtemp(join(tempRoot, 'run-'));
    try {
      await chmod(workDirectory, 0o755);
      await writeFile(join(workDirectory, 'main.py'), source, { mode: 0o444 });
      return await new Promise((resolve, reject) => {
        const containerName = `teaching-python-${id ?? randomUUID()}`;
        const args = [
          'run', '--interactive', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'all', '--security-opt', 'no-new-privileges',
          '--pids-limit', String(limits.pids), '--memory', limits.memory, '--cpus', limits.cpus, '--ulimit', `nofile=${limits.nofile}:${limits.nofile}`,
          '--user', '65534:65534', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m', '--volume', `${workDirectory}:/work:ro`, '--workdir', '/work', '--name', containerName,
          image, 'python', '-I', '-B', '-u', '/work/main.py'
        ];
        const child = spawn(podmanPath, args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
        let stdout = '';
        let stderr = '';
        let outputBytes = 0;
        let outputLimited = false;
        let stopping = false;
        let stopPromise = Promise.resolve();
        const stopContainer = () => {
          if (stopping) return;
          stopping = true;
          child.kill('SIGTERM');
          stopPromise = new Promise((done) => {
            const remover = spawn(podmanPath, ['rm', '--force', containerName], { stdio: 'ignore', shell: false });
            remover.once('error', done);
            remover.once('close', done);
          });
        };
        const receive = (stream, chunk) => {
          const text = chunk.toString('utf8');
          const remaining = limits.outputBytes - outputBytes;
          const accepted = remaining > 0 ? Buffer.from(text).subarray(0, remaining).toString('utf8') : '';
          outputBytes += Buffer.byteLength(accepted, 'utf8');
          if (stream === 'stdout') stdout += accepted;
          else stderr += accepted;
          onOutput?.({ stream, text: accepted });
          if (Buffer.byteLength(text, 'utf8') > Buffer.byteLength(accepted, 'utf8')) {
            outputLimited = true;
            stopContainer();
          }
        };
        child.stdout.on('data', (chunk) => receive('stdout', chunk));
        child.stderr.on('data', (chunk) => receive('stderr', chunk));
        child.on('error', reject);
        child.on('close', (exitCode, exitSignal) => void stopPromise.then(() => resolve({
          exitCode,
          exitSignal,
          outputLimited,
          stdout: normalizeText(stdout, workDirectory),
          stderr: normalizeText(stderr, workDirectory)
        })));
        if (signal) signal.addEventListener('abort', stopContainer, { once: true });
        child.stdin.end(Buffer.from(stdin, 'utf8'));
      });
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  };
}

export class PythonRunner {
  #execute;
  #limits;
  #tasks = new Map();
  #queue = [];
  #running = false;

  constructor({ execute, limits = RUNNER_LIMITS }) {
    if (typeof execute !== 'function') throw new Error('An isolated execution function is required.');
    this.#execute = execute;
    this.#limits = limits;
  }

  submit(input) {
    validateRunInput(input, this.#limits);
    const id = input.id ?? randomUUID();
    if (this.#tasks.has(id)) return structuredClone(this.#tasks.get(id));
    const task = { id, source: input.source, stdin: input.stdin ?? '', status: 'queued', stdout: '', stderr: '', createdAt: new Date().toISOString() };
    this.#tasks.set(id, task);
    this.#queue.push(task);
    void this.#drain();
    return structuredClone(task);
  }

  get(id) {
    const task = this.#tasks.get(id);
    if (!task) throw new RunnerError('not_found', 'The run does not exist.');
    return structuredClone(task);
  }

  stop(id) {
    const task = this.#tasks.get(id);
    if (!task) throw new RunnerError('not_found', 'The run does not exist.');
    if (task.status === 'queued') {
      task.status = 'cancelled';
      this.#queue = this.#queue.filter((candidate) => candidate !== task);
    } else if (task.status === 'running') task.controller.abort();
    return structuredClone(task);
  }

  async #drain() {
    if (this.#running) return;
    this.#running = true;
    while (this.#queue.length) {
      const task = this.#queue.shift();
      if (task.status === 'cancelled') continue;
      task.status = 'running';
      task.startedAt = new Date().toISOString();
      task.controller = new AbortController();
      const timeout = setTimeout(() => {
        task.timedOut = true;
        task.controller.abort();
      }, this.#limits.timeoutMs);
      try {
        const result = await this.#execute({ id: task.id, source: task.source, stdin: task.stdin, signal: task.controller.signal, onOutput: ({ stream, text }) => { task[stream] += text; } });
        task.stdout = result.stdout ?? task.stdout;
        task.stderr = result.stderr ?? task.stderr;
        if (task.timedOut) task.status = 'time_limit';
        else if (task.controller.signal.aborted) task.status = 'cancelled';
        else if (result.outputLimited) task.status = 'output_limit';
        else if (result.exitCode === 0) task.status = 'completed';
        else task.status = 'runtime_error';
      } catch (error) {
        task.status = task.timedOut ? 'time_limit' : task.controller.signal.aborted ? 'cancelled' : 'system_error';
        if (!task.controller.signal.aborted) task.stderr = error.message;
      } finally {
        clearTimeout(timeout);
        delete task.controller;
        delete task.timedOut;
        task.completedAt = new Date().toISOString();
      }
    }
    this.#running = false;
  }
}
