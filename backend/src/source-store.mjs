import { mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { validateSnapshot } from './validation.mjs';

function isMissing(error) {
  return error?.code === 'ENOENT';
}

export class SourceStore {
  #root;

  constructor(root) {
    this.#root = root;
  }

  #snapshotPath(revisionId) {
    if (typeof revisionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(revisionId)) throw new Error('Invalid Python revision identifier.');
    return join(this.#root, `${revisionId}.json`);
  }

  #markerPath(revisionId) {
    if (typeof revisionId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(revisionId)) throw new Error('Invalid Python revision identifier.');
    return join(this.#root, '.gc', `${revisionId}.delete`);
  }

  async init() {
    await mkdir(join(this.#root, '.gc'), { recursive: true });
  }

  async write(revisionId, input) {
    const snapshot = validateSnapshot(input);
    const target = this.#snapshotPath(revisionId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(snapshot), 'utf8');
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return snapshot;
  }

  async read(revisionId) {
    const raw = await readFile(this.#snapshotPath(revisionId), 'utf8');
    return validateSnapshot(JSON.parse(raw));
  }

  async removeEventually(revisionId) {
    const marker = this.#markerPath(revisionId);
    await mkdir(dirname(marker), { recursive: true });
    await writeFile(marker, '', { flag: 'a', mode: 0o600 });
    try {
      await unlink(this.#snapshotPath(revisionId));
      await unlink(marker);
      return true;
    } catch (error) {
      if (isMissing(error)) {
        try {
          await unlink(marker);
        } catch (markerError) {
          if (!isMissing(markerError)) throw markerError;
        }
        return true;
      }
      return false;
    }
  }

  async retryPending() {
    const directory = join(this.#root, '.gc');
    let entries;
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const results = [];
    for (const entry of entries) {
      if (!entry.endsWith('.delete')) continue;
      const revisionId = entry.slice(0, -'.delete'.length);
      results.push({ revisionId, removed: await this.removeEventually(revisionId) });
    }
    return results;
  }

  async removeOrphans(protectedRevisionIds) {
    const protectedIds = new Set(protectedRevisionIds);
    const entries = await readdir(this.#root, { withFileTypes: true });
    const removed = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const revisionId = entry.name.slice(0, -'.json'.length);
      if (protectedIds.has(revisionId)) continue;
      const info = await stat(this.#snapshotPath(revisionId));
      if (info.isFile() && await this.removeEventually(revisionId)) removed.push(revisionId);
    }
    return removed;
  }
}

export class MemorySourceStore {
  #snapshots = new Map();

  async init() {}

  async write(revisionId, input) {
    const snapshot = validateSnapshot(input);
    if (this.#snapshots.has(revisionId)) throw new Error(`Snapshot ${revisionId} already exists.`);
    this.#snapshots.set(revisionId, structuredClone(snapshot));
    return structuredClone(snapshot);
  }

  async read(revisionId) {
    const snapshot = this.#snapshots.get(revisionId);
    if (!snapshot) {
      const error = new Error(`Snapshot ${revisionId} was not found.`);
      error.code = 'ENOENT';
      throw error;
    }
    return structuredClone(snapshot);
  }

  async removeEventually(revisionId) {
    this.#snapshots.delete(revisionId);
    return true;
  }

  async retryPending() {
    return [];
  }

  async removeOrphans(protectedRevisionIds) {
    const protectedIds = new Set(protectedRevisionIds);
    const removed = [];
    for (const revisionId of this.#snapshots.keys()) {
      if (!protectedIds.has(revisionId)) {
        this.#snapshots.delete(revisionId);
        removed.push(revisionId);
      }
    }
    return removed;
  }
}
