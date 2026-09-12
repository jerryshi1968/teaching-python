import { AppError } from './errors.mjs';

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
  if (typeof stdin !== 'string' || Buffer.byteLength(stdin, 'utf8') > 16 * 1024) {
    throw new AppError(400, 'INVALID_STDIN', 'Standard input must be text no larger than 16 KiB.');
  }
  return stdin;
}
