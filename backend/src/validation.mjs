import { AppError } from './errors.mjs';
import {
  DEFAULT_ENTRYPOINT,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_PROJECT_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_STDIN_BYTES,
  SNAPSHOT_SCHEMA_VERSION
} from '../../shared/contracts.mjs';

const MAX_NAME_LENGTH = 80;

export function requireName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_NAME_LENGTH) {
    throw new AppError(400, 'INVALID_NAME', 'A project or group name is required and must be at most 80 characters.');
  }
  return name.trim();
}

export function requireSource(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 64 * 1024) {
    throw new AppError(400, 'INVALID_SOURCE', 'Python source must be text no larger than 64 KiB.');
  }
  return source;
}

export function requireStdin(stdin) {
  if (typeof stdin !== 'string' || Buffer.byteLength(stdin, 'utf8') > MAX_STDIN_BYTES) {
    throw new AppError(400, 'INVALID_STDIN', 'Standard input must be text no larger than 16 KiB.');
  }
  return stdin;
}

export function requireFilePath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || path.includes('\\') || path.includes('\0') || path.startsWith('/')) {
    throw new AppError(400, 'INVALID_FILE_PATH', '文件路径必须是有效的 POSIX 相对路径');
  }
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.length > 100 || part.includes(':') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || parts[0] === '.python-program') {
    throw new AppError(400, 'INVALID_FILE_PATH', '文件路径包含不允许的目录或名称');
  }
  return path;
}

export function validateSnapshot(input) {
  const candidate = typeof input?.source === 'string' && input.files == null
    ? { schemaVersion: SNAPSHOT_SCHEMA_VERSION, entrypoint: DEFAULT_ENTRYPOINT, files: [{ path: DEFAULT_ENTRYPOINT, content: input.source }], stdin: input.stdin }
    : input;
  if (!candidate || candidate.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || !Array.isArray(candidate.files)) {
    throw new AppError(400, 'INVALID_SNAPSHOT', `代码快照必须使用 schemaVersion ${SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (candidate.files.length === 0 || candidate.files.length > MAX_FILES) {
    throw new AppError(400, 'INVALID_FILE_COUNT', `项目文件数必须在 1 到 ${MAX_FILES} 之间`);
  }
  const paths = new Set();
  const lowerPaths = new Set();
  const files = candidate.files.map((file) => {
    const path = requireFilePath(file?.path);
    if (typeof file?.content !== 'string') {
      throw new AppError(400, 'INVALID_FILE_CONTENT', `文件 ${path} 的内容必须是字符串`);
    }
    const bytes = Buffer.byteLength(file.content);
    if (bytes > MAX_FILE_BYTES) {
      throw new AppError(400, 'FILE_TOO_LARGE', `单个文件不能超过 ${MAX_FILE_BYTES / 1024} KiB`);
    }
    const lowerPath = path.toLowerCase();
    if (paths.has(path) || lowerPaths.has(lowerPath)) {
      throw new AppError(400, 'DUPLICATE_FILE_PATH', `文件路径重复：${path}`);
    }
    paths.add(path);
    lowerPaths.add(lowerPath);
    return { path, content: file.content };
  });
  for (const file of files) {
    const parts = file.path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      if (lowerPaths.has(parts.slice(0, index).join('/').toLowerCase())) {
        throw new AppError(400, 'FILE_DIRECTORY_CONFLICT', `文件与目录冲突：${file.path}`);
      }
    }
  }
  const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);
  if (totalBytes > MAX_PROJECT_BYTES) {
    throw new AppError(400, 'PROJECT_TOO_LARGE', `项目代码总量不能超过 ${MAX_PROJECT_BYTES / 1024} KiB`);
  }
  const entrypoint = requireFilePath(candidate.entrypoint);
  if (!entrypoint.endsWith('.py') || !paths.has(entrypoint)) {
    throw new AppError(400, 'INVALID_ENTRYPOINT', '入口文件必须是项目中存在的 .py 文件');
  }
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    entrypoint,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    stdin: requireStdin(candidate.stdin ?? '')
  };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_SNAPSHOT_BYTES) {
    throw new AppError(400, 'SNAPSHOT_TOO_LARGE', `代码快照不能超过 ${MAX_SNAPSHOT_BYTES / 1024} KiB`);
  }
  return snapshot;
}
