import { mkdir } from 'node:fs/promises';
import { createPodmanExecutor, PythonRunner } from './runner.mjs';
import { createRunnerHttpServer } from './server.mjs';

const token = process.env.RUNNER_TOKEN;
const image = process.env.RUNNER_IMAGE;
const tempRoot = process.env.RUNNER_TEMP_ROOT;
const port = Number(process.env.RUNNER_PORT);

if (!token || !image || !tempRoot || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('RUNNER_TOKEN, RUNNER_IMAGE, RUNNER_TEMP_ROOT, and RUNNER_PORT must be configured.');
}

await mkdir(tempRoot, { recursive: true, mode: 0o700 });
const execute = createPodmanExecutor({ image, tempRoot });
const runner = new PythonRunner({ execute });
const server = createRunnerHttpServer({ runner, token });

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Python runner listening on 127.0.0.1:${port}\n`);
});