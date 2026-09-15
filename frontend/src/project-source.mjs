export const DEFAULT_PYTHON_SOURCE = {
  schemaVersion: 2,
  entrypoint: 'main.py',
  files: [{ path: 'main.py', content: 'print("Hello, Python!")\n' }],
  stdin: ''
};

function requireProjectPath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || path.includes('\\') || path.includes('\0') || path.startsWith('/')) throw new Error('请输入有效的 POSIX 相对文件路径。');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.length > 100 || part.includes(':') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || parts[0] === '.python-program') throw new Error('文件路径包含不允许的目录或名称。');
  return path;
}

function assertNoConflict(files, path) {
  const lowerPath = path.toLowerCase();
  if (files.some((file) => {
    const existing = file.path.toLowerCase();
    return existing === lowerPath || existing.startsWith(`${lowerPath}/`) || lowerPath.startsWith(`${existing}/`);
  })) throw new Error('文件名已存在，或与现有目录冲突。');
}

export function normalizeProjectSource(value = {}) {
  if (Array.isArray(value.files)) {
    const files = value.files.map((file) => ({ path: String(file.path), content: String(file.content ?? '') }));
    const entrypoint = typeof value.entrypoint === 'string' && files.some((file) => file.path === value.entrypoint)
      ? value.entrypoint
      : files.find((file) => file.path.endsWith('.py'))?.path ?? files[0]?.path ?? 'main.py';
    return { schemaVersion: 2, entrypoint, files, stdin: String(value.stdin ?? '') };
  }
  return { schemaVersion: 2, entrypoint: 'main.py', files: [{ path: 'main.py', content: String(value.source ?? '') }], stdin: String(value.stdin ?? '') };
}

export function updateFileContent(snapshot, path, content) {
  return { ...snapshot, files: snapshot.files.map((file) => file.path === path ? { ...file, content } : file) };
}

export function addProjectFile(snapshot, path) {
  requireProjectPath(path);
  assertNoConflict(snapshot.files, path);
  return { ...snapshot, files: [...snapshot.files, { path, content: '' }].sort((left, right) => left.path.localeCompare(right.path)) };
}

export function renameProjectFile(snapshot, oldPath, newPath) {
  requireProjectPath(newPath);
  if (snapshot.entrypoint === oldPath && !newPath.endsWith('.py')) throw new Error('入口文件必须保留 .py 扩展名。');
  assertNoConflict(snapshot.files.filter((file) => file.path !== oldPath), newPath);
  return {
    ...snapshot,
    entrypoint: snapshot.entrypoint === oldPath ? newPath : snapshot.entrypoint,
    files: snapshot.files.map((file) => file.path === oldPath ? { ...file, path: newPath } : file).sort((left, right) => left.path.localeCompare(right.path))
  };
}

export function deleteProjectFile(snapshot, path) {
  if (snapshot.files.length === 1) throw new Error('项目至少需要保留一个文件。');
  const files = snapshot.files.filter((file) => file.path !== path);
  const entrypoint = snapshot.entrypoint === path ? files.find((file) => file.path.endsWith('.py'))?.path : snapshot.entrypoint;
  if (!entrypoint) throw new Error('删除入口文件前，请先保留另一个 Python 文件。');
  return { ...snapshot, entrypoint, files };
}
