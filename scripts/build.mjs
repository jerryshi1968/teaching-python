import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('dist');
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, '.gitkeep'), '');
console.log('Local placeholder build completed.');
