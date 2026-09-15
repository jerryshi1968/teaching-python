import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readConfig(env = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'test', 'production'].includes(mode)) throw new Error('APP_MODE must be demo, test, or production.');
  const port = Number(env.PORT || 5183);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  const commonApi = env.COMMON_API_URL || 'http://127.0.0.1:5000/api';
  const parsed = new URL(commonApi);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('COMMON_API_URL must be a loopback HTTP endpoint.');
  if (mode === 'production' && (!env.DB_NAME || !env.DB_USER || !env.DB_PASSWORD || !env.RUNNER_TOKEN)) throw new Error('Production database and runner credentials must be configured.');
  return { mode, host: '127.0.0.1', port, commonApi, storageRoot: path.resolve(env.PYTHON_STORAGE_ROOT || path.join(ROOT, 'storage', mode)), runnerUrl: env.RUNNER_URL || 'http://127.0.0.1:5182', runnerToken: env.RUNNER_TOKEN || '', db: { host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectionLimit: 4, timezone: 'Z', charset: 'utf8mb4' } };
}
