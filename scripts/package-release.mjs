import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve('.');
const outputDirectory = resolve('release');
const includedRoots = [
  'frontend/dist',
  'frontend/vendor/organizer',
  'frontend/package.json',
  'backend/package.json',
  'backend/src',
  'backend/migrations',
  'runner/src',
  'shared',
  'docs/release-runbook.md',
  'package.json',
  'package-lock.json'
];

const listFiles = async (path) => {
  const fileStat = await stat(path);
  if (fileStat.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name)).map(async (entry) => {
    const entryPath = resolve(path, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return files.flat();
};

const hashFile = async (path) => {
  const content = await readFile(path);
  return createHash('sha256').update(content).digest('hex');
};

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const files = (await Promise.all(includedRoots.map((entry) => listFiles(resolve(entry))))).flat();
const manifestFiles = await Promise.all(files.map(async (path) => ({
  path: relative(root, path).split(sep).join('/'),
  bytes: (await stat(path)).size,
  sha256: await hashFile(path)
})));

manifestFiles.sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  schemaVersion: 1,
  package: 'teaching-python',
  version: '0.1.0',
  generatedAt: new Date().toISOString(),
  files: manifestFiles
};
const checksums = manifestFiles.map((file) => `${file.sha256}  ${file.path}`).join('\n') + '\n';

await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(outputDirectory, 'SHA256SUMS'), checksums);
console.log(`Release manifest written for ${manifestFiles.length} files in ${relative(root, outputDirectory)}.`);
