export const SNAPSHOT_SCHEMA_VERSION = 2;
export const DEFAULT_ENTRYPOINT = 'main.py';
export const DEFAULT_SOURCE = "print('Hello, Python!')\n";
export const MAX_FILES = 64;
export const MAX_FILE_BYTES = 128 * 1024;
export const MAX_PROJECT_BYTES = 512 * 1024;
export const MAX_SNAPSHOT_BYTES = 1024 * 1024;
export const MAX_STDIN_BYTES = 16 * 1024;

export const DEFAULT_SNAPSHOT = Object.freeze({
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  entrypoint: DEFAULT_ENTRYPOINT,
  files: Object.freeze([
    Object.freeze({ path: DEFAULT_ENTRYPOINT, content: DEFAULT_SOURCE })
  ]),
  stdin: ''
});
