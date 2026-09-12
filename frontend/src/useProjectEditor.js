import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, pollRun } from './api.mjs';

function draftKey(projectId) {
  return `python:draft:${projectId}`;
}

function readDraft(projectId) {
  try {
    const raw = localStorage.getItem(draftKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(projectId, value) {
  localStorage.setItem(draftKey(projectId), JSON.stringify(value));
}

export function useProjectEditor({ projectId, api, demoMode = false }) {
  const [project, setProject] = useState(null);
  const [source, setSource] = useState('');
  const [stdin, setStdin] = useState('');
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    controllerRef.current?.abort();
    setError(null);
    setRun(null);
    if (!projectId) return undefined;
    if (demoMode) {
      setProject({ id: projectId, version: 1, readOnly: false });
      setSource('print("Hello, Python!")\n');
      setStdin('');
      setHistory([]);
      return undefined;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await api.loadProject(projectId, { signal: controller.signal });
        const draft = readDraft(projectId);
        setProject(loaded);
        setSource(draft?.source ?? loaded.source);
        setStdin(draft?.stdin ?? loaded.stdin);
        const runs = await api.listRuns(projectId, { signal: controller.signal });
        setHistory(runs.runs ?? []);
      } catch (cause) {
        if (cause.name !== 'AbortError') setError(cause);
      }
    })();
    return () => controller.abort();
  }, [api, demoMode, projectId]);

  const changeSource = useCallback((value) => {
    setSource(value);
    if (projectId && !demoMode) writeDraft(projectId, { source: value, stdin });
  }, [demoMode, projectId, stdin]);

  const changeStdin = useCallback((value) => {
    setStdin(value);
    if (projectId && !demoMode) writeDraft(projectId, { source, stdin: value });
  }, [demoMode, projectId, source]);

  const save = useCallback(async () => {
    if (demoMode) throw new ApiError({ status: 501, code: 'DEMO_MODE', message: 'The local preview does not save or run code.' });
    if (!project || project.readOnly) return project;
    try {
      const saved = await api.saveProject(project.id, { source, stdin, version: project.version });
      setProject((current) => ({ ...current, ...saved }));
      localStorage.removeItem(draftKey(project.id));
      setError(null);
      return saved;
    } catch (cause) {
      setError(cause);
      throw cause;
    }
  }, [api, demoMode, project, source, stdin]);

  const start = useCallback(async () => {
    const saved = await save();
    const queued = await api.startRun(saved.id, { requestId: crypto.randomUUID() });
    setRun(queued);
    setHistory((current) => [queued, ...current.filter((item) => item.id !== queued.id)]);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const finished = await pollRun(api, queued.id, { signal: controller.signal, onUpdate: setRun });
      setRun(finished);
      setHistory((current) => [finished, ...current.filter((item) => item.id !== finished.id)]);
      return finished;
    } catch (cause) {
      if (cause.name !== 'AbortError') setError(cause);
      throw cause;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [api, save]);

  const stop = useCallback(async () => {
    if (!run || !['queued', 'running'].includes(run.status)) return run;
    controllerRef.current?.abort();
    const stopped = await api.stopRun(run.id);
    setRun(stopped);
    setHistory((current) => [stopped, ...current.filter((item) => item.id !== stopped.id)]);
    return stopped;
  }, [api, run]);

  return { project, source, stdin, run, history, error, changeSource, changeStdin, save, start, stop };
}