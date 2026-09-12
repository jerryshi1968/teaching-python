import { AppError } from './errors.mjs';

export function createRunnerClient({ baseUrl, token, fetchImpl = fetch }) {
  const endpoint = new URL(baseUrl);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1') {
    throw new Error('The Python runner must use a loopback HTTP endpoint.');
  }
  if (!token || token.length < 32) throw new Error('A runner token of at least 32 characters is required.');

  async function request(path, { method = 'GET', body } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(path, endpoint), {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new AppError(503, 'RUNNER_UNAVAILABLE', 'The Python runner is unavailable.');
    }
    const payload = await response.json();
    if (!response.ok) throw new AppError(502, 'RUNNER_ERROR', payload.message ?? 'The Python runner rejected the task.');
    return payload;
  }

  return {
    submit: (run) => request('/runs', { method: 'POST', body: run }),
    get: (id) => request(`/runs/${encodeURIComponent(id)}`),
    stop: (id) => request(`/runs/${encodeURIComponent(id)}/stop`, { method: 'POST' })
  };
}