import { createServer } from 'node:http';
import { createPool } from 'mysql2/promise';
import { createPythonApp } from './app.mjs';
import { authenticate } from './auth.mjs';
import { readConfig } from './config.mjs';
import { MysqlPythonRepository } from './mysql-repository.mjs';
import { createRunnerClient } from './runner-client.mjs';
import { PythonService } from './service.mjs';
import { SourceStore } from './source-store.mjs';

const config = readConfig();
const sources = new SourceStore(config.storageRoot);
await sources.init();
await sources.retryPending();
const repository = new MysqlPythonRepository(createPool(config.db), sources);
const service = new PythonService(repository, createRunnerClient({ baseUrl: config.runnerUrl, token: config.runnerToken }));
const app = createPythonApp(service);
const readBody = async request => new Promise((resolve, reject) => { let body = ''; request.setEncoding('utf8'); request.on('data', chunk => { body += chunk; if (Buffer.byteLength(body) > 1100 * 1024) reject(new Error('Request body too large.')); }); request.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON.')); } }); request.on('error', reject); });
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') { response.writeHead(200, { 'content-type': 'application/json' }); return response.end('{"status":"ok"}'); }
    const url = new URL(request.url, 'http://127.0.0.1');
    const actor = await authenticate(request, { commonApi: config.commonApi, repository });
    const result = await app({ actor, method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: ['POST', 'PUT', 'PATCH'].includes(request.method) ? await readBody(request) : {} });
    response.writeHead(result.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(result.body));
  } catch (error) {
    const status = error.status || 500; response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify({ code: error.code || 'INTERNAL_ERROR', message: error.message || 'Internal server error.' }));
  }
});
server.listen(config.port, config.host, () => console.log(`Python production backend listening on ${config.host}:${config.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => repository.close().finally(() => process.exit(0))));
