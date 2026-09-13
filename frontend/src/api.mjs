const API_PREFIX = '/api/python';

export class ApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createApiClient({ fetchImpl = fetch, getLanguage = () => 'zh', getToken = () => {
  try { return localStorage.getItem('teaching_token'); } catch { return null; }
} } = {}) {
  return async function api(path, { method = 'GET', body, signal } = {}) {
    const token = getToken();
    const response = await fetchImpl(`${API_PREFIX}${path}`, {
      method,
      signal,
      headers: {
        'Accept-Language': getLanguage(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json();
    if (!response.ok) throw new ApiError({ status: response.status, code: payload.code, message: payload.message });
    return payload;
  };
}

export function createPythonApi(options) {
  const request = createApiClient(options);
  return {
    loadProject: (id, options) => request(`/projects/${encodeURIComponent(id)}`, options),
    saveProject: (id, body, options) => request(`/projects/${encodeURIComponent(id)}/source`, { ...options, method: 'PUT', body }),
    startRun: (id, body = {}, options) => request(`/projects/${encodeURIComponent(id)}/run`, { ...options, method: 'POST', body }),
    listRuns: (id, options) => request(`/projects/${encodeURIComponent(id)}/runs`, options),
    getRun: (id, options) => request(`/runs/${encodeURIComponent(id)}`, options),
    getRunSource: (id, options) => request(`/runs/${encodeURIComponent(id)}/source`, options),
    stopRun: (id, options) => request(`/runs/${encodeURIComponent(id)}/stop`, { ...options, method: 'POST', body: {} }),
    listClasses: (options) => request('/classes', options),
    listStudents: (id, options) => request(`/classes/${encodeURIComponent(id)}/students`, options),
    copyProject: (id, options) => request(`/projects/${encodeURIComponent(id)}/copy`, { ...options, method: 'POST', body: {} }),
    distributeProject: (id, body, options) => request(`/projects/${encodeURIComponent(id)}/distribute`, { ...options, method: 'POST', body })
  };
}

export async function pollRun(api, id, { signal, intervalMs = 750, onUpdate } = {}) {
  while (true) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('The run poll was cancelled.', 'AbortError');
    const run = await api.getRun(id, { signal });
    onUpdate?.(run);
    if (!['queued', 'running'].includes(run.status)) return run;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('The run poll was cancelled.', 'AbortError')); }, { once: true });
    });
  }
}