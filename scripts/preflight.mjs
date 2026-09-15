import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredPaths = [
  'frontend/src',
  'frontend/vendor/organizer/SHA256SUMS',
  'backend/src/app.mjs',
  'backend/src/runner-client.mjs',
  'backend/src/server.mjs',
  'backend/src/mysql-repository.mjs',
  'backend/src/mysql-repository-v2.mjs',
  'backend/src/migrate.mjs',
  'backend/migrations/001_python.sql',
  'backend/migrations/002_python_distributions.sql',
  'backend/migrations/003_python_shared_projects.sql',
  'backend/migrations/004_python_multifile.sql',
  'backend/src/source-store.mjs',
  'shared/contracts.mjs',
  'runner/src/index.mjs',
  'runner/src/runner.mjs',
  'runner/src/runner-v2.mjs',
  'runner/src/server.mjs',
  'docs/release-runbook.md',
  'tests'
];

for (const requiredPath of requiredPaths) {
  await access(resolve(requiredPath));
}

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
if (packageJson.name !== 'teaching-python' || packageJson.version !== '0.1.0') {
  throw new Error('The release package identity must remain teaching-python@0.1.0.');
}

const runnerEntry = await readFile(resolve('runner/src/index.mjs'), 'utf8');
if (!runnerEntry.includes("server.listen(port, '127.0.0.1'")) {
  throw new Error('The runner must bind only to loopback.');
}

const runnerClient = await readFile(resolve('backend/src/runner-client.mjs'), 'utf8');
if (!runnerClient.includes("endpoint.hostname !== '127.0.0.1'")) {
  throw new Error('The backend runner client must target loopback only.');
}

const viteConfig = await readFile(resolve('frontend/vite.config.mjs'), 'utf8');
if (!viteConfig.includes("base: '/teaching-python/'")) {
  throw new Error('The frontend deployment base must remain /teaching-python/.');
}

console.log('Release preflight passed. No server connection was made.');
