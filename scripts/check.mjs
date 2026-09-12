import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredPaths = [
  'frontend/src',
  'backend/src/app.mjs',
  'backend/src/repository.mjs',
  'backend/src/service.mjs',
  'runner/src',
  'tests'
];

for (const requiredPath of requiredPaths) {
  await access(resolve(requiredPath));
}

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
if (packageJson.name !== 'teaching-python') {
  throw new Error('The package name must remain teaching-python.');
}

console.log('Project boundary checks passed.');
