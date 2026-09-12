import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { RunnerError } from './runner.mjs';

function isAuthorized(request, token) {
  const supplied = request.headers.authorization;
  const expected = `Bearer ${token}`;
  if (typeof supplied !== 'string' || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 96 * 1024) throw new RunnerError('invalid_request', 'The request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RunnerError('invalid_request', 'The request body must be valid JSON.');
  }
}

function publicTask(task) {
  const { source, stdin, controller, ...result } = task;
  return result;
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

export function createRunnerHttpServer({ runner, token }) {
  if (!token || token.length < 32) throw new Error('A runner token of at least 32 characters is required.');
  return createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health') return send(response, 200, { status: 'ok' });
      if (!isAuthorized(request, token)) return send(response, 401, { code: 'unauthorized', message: 'Runner authentication failed.' });
      if (request.method === 'POST' && request.url === '/runs') return send(response, 202, publicTask(runner.submit(await readJson(request))));
      const match = request.url?.match(/^\/runs\/([^/]+)(?:\/(stop))?$/);
      if (match && request.method === 'GET' && !match[2]) return send(response, 200, publicTask(runner.get(match[1])));
      if (match && request.method === 'POST' && match[2] === 'stop') return send(response, 202, publicTask(runner.stop(match[1])));
      return send(response, 404, { code: 'not_found', message: 'The runner endpoint was not found.' });
    } catch (error) {
      if (error instanceof RunnerError) return send(response, error.code === 'not_found' ? 404 : 400, { code: error.code, message: error.message });
      return send(response, 500, { code: 'system_error', message: 'The runner could not process the request.' });
    }
  });
}
