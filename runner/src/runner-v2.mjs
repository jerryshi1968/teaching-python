import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_PROJECT_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_STDIN_BYTES,
  SNAPSHOT_SCHEMA_VERSION
} from '../../shared/contracts.mjs';

export const RUNNER_LIMITS = Object.freeze({
  sourceBytes: 64 * 1024,
  fileBytes: MAX_FILE_BYTES,
  files: MAX_FILES,
  projectBytes: MAX_PROJECT_BYTES,
  snapshotBytes: MAX_SNAPSHOT_BYTES,
  stdinBytes: MAX_STDIN_BYTES,
  outputBytes: 64 * 1024,
  timeoutMs: 3_000,
  memory: '256m',
  cpus: '1',
  pids: 64,
  nofile: 64
});

const PYTHON_BOOTSTRAP = "import posixpath,runpy,sys;p=sys.argv[1];sys.path[:0]=['/work/'+posixpath.dirname(p),'/work'];sys.argv=[p,*sys.argv[2:]];runpy.run_path('/work/'+p,run_name='__main__')";

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function requirePath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || path.includes('\\') || path.includes('\0') || path.startsWith('/')) throw new RunnerError('invalid_path', 'Every file must use a safe POSIX relative path.');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.length > 100 || part.includes(':') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || parts[0] === '.python-program') throw new RunnerError('invalid_path', 'The file path contains a reserved or unsafe segment.');
  return path;
}

function validateRunInput(input, limits) {
  const legacy = typeof input?.source === 'string' && input.files == null;
  if (legacy && byteLength(input.source) > (limits.sourceBytes ?? 64 * 1024)) throw new RunnerError('invalid_source', 'Python source must be text within the source limit.');
  const candidate = legacy
    ? { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entrypoint: 'main.py', files: [{ path: 'main.py', content: input.source }], stdin: input.stdin ?? '' }
    : input;
  if (!candidate || candidate.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !Array.isArray(candidate.files) || candidate.files.length < 1 || candidate.files.length > (limits.files ?? MAX_FILES)) throw new RunnerError('invalid_snapshot', 'The Python snapshot is invalid.');
  const paths = new Set();
  const lowerPaths = new Set();
  let projectBytes = 0;
  const files = candidate.files.map((file) => {
    const path = requirePath(file?.path);
    if (typeof file?.content !== 'string' || byteLength(file.content) > (limits.fileBytes ?? MAX_FILE_BYTES)) throw new RunnerError('invalid_source', 'A project file is not text or exceeds the file limit.');
    const lowerPath = path.toLowerCase();
    if (lowerPaths.has(lowerPath)) throw new RunnerError('duplicate_path', 'Project file paths must be unique without regard to case.');
    paths.add(path);
    lowerPaths.add(lowerPath);
    projectBytes += byteLength(file.content);
    return { path, content: file.content };
  });
  for (const file of files) {
    const parts = file.path.split('/');
    for (let index = 1; index < parts.length; index += 1) if (lowerPaths.has(parts.slice(0, index).join('/').toLowerCase())) throw new RunnerError('path_conflict', 'A file path conflicts with a project directory.');
  }
  if (projectBytes > (limits.projectBytes ?? MAX_PROJECT_BYTES)) throw new RunnerError('invalid_source', 'The project exceeds the source limit.');
  const entrypoint = requirePath(candidate.entrypoint);
  if (!entrypoint.endsWith('.py') || !paths.has(entrypoint)) throw new RunnerError('invalid_entrypoint', 'The entrypoint must be an existing Python file.');
  const stdin = candidate.stdin ?? '';
  if (typeof stdin !== 'string' || byteLength(stdin) > limits.stdinBytes) throw new RunnerError('invalid_stdin', 'Standard input must be text within the input limit.');
  const snapshot = { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entrypoint, files, stdin };
  if (byteLength(JSON.stringify(snapshot)) > (limits.snapshotBytes ?? MAX_SNAPSHOT_BYTES)) throw new RunnerError('invalid_snapshot', 'The Python snapshot exceeds the request limit.');
  return snapshot;
}

function normalizeText(value, workDirectory, entrypoint) {
  return value.replaceAll(workDirectory, '/work').replaceAll(`/work/${entrypoint}`, entrypoint);
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

  return async function execute({ entrypoint, files, stdin, signal, onOutput, id }) {
    const workDirectory = await mkdtemp(join(tempRoot, 'run-'));
    try {
      await chmod(workDirectory, 0o755);
      for (const file of files) {
        const target = resolve(workDirectory, ...file.path.split('/'));
        if (!target.startsWith(`${resolve(workDirectory)}${sep}`)) throw new RunnerError('invalid_path', 'The project file resolved outside the isolated workspace.');
        await mkdir(dirname(target), { recursive: true, mode: 0o755 });
        await writeFile(target, file.content, { flag: 'wx', mode: 0o444 });
      }
      return await new Promise((resolve, reject) => {
        const containerName = `teaching-python-${id ?? randomUUID()}`;
        const args = [
          'run', '--interactive', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'all', '--security-opt', 'no-new-privileges',
          '--pids-limit', String(limits.pids), '--memory', limits.memory, '--cpus', limits.cpus, '--ulimit', `nofile=${limits.nofile}:${limits.nofile}`,
          '--user', '65534:65534', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m', '--volume', `${workDirectory}:/work:ro`, '--workdir', '/work', '--name', containerName,
          image, 'python', '-I', '-B', '-u', '-c', PYTHON_BOOTSTRAP, entrypoint
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
          stdout: normalizeText(stdout, workDirectory, entrypoint),
          stderr: normalizeText(stderr, workDirectory, entrypoint)
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
    const snapshot = validateRunInput(input, this.#limits);
    const id = input.id ?? randomUUID();
    if (this.#tasks.has(id)) return structuredClone(this.#tasks.get(id));
    const entry = snapshot.files.find((file) => file.path === snapshot.entrypoint);
    const task = { id, ...snapshot, source: entry?.content ?? '', status: 'queued', stdout: '', stderr: '', createdAt: new Date().toISOString() };
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
        const result = await this.#execute({ id: task.id, schemaVersion: task.schemaVersion, entrypoint: task.entrypoint, files: structuredClone(task.files), source: task.source, stdin: task.stdin, signal: task.controller.signal, onOutput: ({ stream, text }) => { task[stream] += text; } });
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
