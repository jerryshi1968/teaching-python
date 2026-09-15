import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, pollRun } from './api.mjs';
import { addProjectFile, deleteProjectFile, normalizeProjectSource, renameProjectFile, updateFileContent } from './project-source.mjs';

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
  const [snapshot, setSnapshot] = useState(() => normalizeProjectSource());
  const [activePath, setActivePath] = useState('main.py');
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyView, setHistoryView] = useState(null);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    controllerRef.current?.abort();
    setError(null);
    setRun(null);
    setHistoryView(null);
    if (!projectId) return undefined;
    if (demoMode) {
      const content = normalizeProjectSource({ source: 'print("Hello, Python!")\n', stdin: '' });
      setProject({ id: projectId, version: 1, readOnly: false });
      setSnapshot(content);
      setActivePath(content.entrypoint);
      setHistory([]);
      return undefined;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const loaded = await api.loadProject(projectId, { signal: controller.signal });
        const content = normalizeProjectSource(readDraft(projectId) ?? loaded);
        setProject(loaded);
        setSnapshot(content);
        setActivePath(content.entrypoint);
        const runs = await api.listRuns(projectId, { signal: controller.signal });
        setHistory(runs.runs ?? []);
      } catch (cause) {
        if (cause.name !== 'AbortError') setError(cause);
      }
    })();
    return () => controller.abort();
  }, [api, demoMode, projectId]);

  const updateSnapshot = useCallback((updater) => {
    setSnapshot((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (projectId && !demoMode) writeDraft(projectId, next);
      return next;
    });
  }, [demoMode, projectId]);

  const changeSource = useCallback((value) => updateSnapshot((current) => updateFileContent(current, activePath, value)), [activePath, updateSnapshot]);
  const changeStdin = useCallback((value) => updateSnapshot((current) => ({ ...current, stdin: value })), [updateSnapshot]);
  const addFile = useCallback((path) => {
    updateSnapshot((current) => addProjectFile(current, path));
    setActivePath(path);
  }, [updateSnapshot]);
  const renameFile = useCallback((path) => {
    updateSnapshot((current) => renameProjectFile(current, activePath, path));
    setActivePath(path);
  }, [activePath, updateSnapshot]);
  const deleteFile = useCallback(() => {
    const next = deleteProjectFile(snapshot, activePath);
    updateSnapshot(next);
    setActivePath(next.entrypoint === activePath ? next.files[0].path : next.entrypoint);
  }, [activePath, snapshot, updateSnapshot]);
  const setEntrypoint = useCallback(() => updateSnapshot((current) => ({ ...current, entrypoint: activePath })), [activePath, updateSnapshot]);

  const save = useCallback(async () => {
    if (demoMode) throw new ApiError({ status: 501, code: 'DEMO_MODE', message: 'The local preview does not save or run code.' });
    if (!project || project.readOnly) return project;
    try {
      const saved = await api.saveProject(project.id, { ...snapshot, version: project.version });
      const content = normalizeProjectSource(saved);
      setProject((current) => ({ ...current, ...saved }));
      setSnapshot(content);
      localStorage.removeItem(draftKey(project.id));
      setError(null);
      return saved;
    } catch (cause) {
      setError(cause);
      throw cause;
    }
  }, [api, demoMode, project, snapshot]);

  const start = useCallback(async () => {
    setError(null);
    setHistoryView(null);
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

  const selectHistory = useCallback(async (id) => {
    const selected = history.find((item) => item.id === id);
    if (!selected) return;
    try {
      const historicalSnapshot = normalizeProjectSource(await api.getRunSource(id));
      setHistoryView({ run: selected, snapshot: historicalSnapshot });
      setActivePath(historicalSnapshot.entrypoint);
      setError(null);
    } catch (cause) {
      setError(cause);
      throw cause;
    }
  }, [api, history]);

  const exitHistoryView = useCallback(() => {
    setHistoryView(null);
    setActivePath(snapshot.entrypoint);
  }, [snapshot.entrypoint]);
  const stop = useCallback(async () => {
    if (!run || !['queued', 'running'].includes(run.status)) return run;
    controllerRef.current?.abort();
    const stopped = await api.stopRun(run.id);
    setRun(stopped);
    setHistory((current) => [stopped, ...current.filter((item) => item.id !== stopped.id)]);
    return stopped;
  }, [api, run]);

  const displaySnapshot = historyView?.snapshot ?? snapshot;
  const displayFile = displaySnapshot.files.find((file) => file.path === activePath) ?? displaySnapshot.files[0];
  return { project, snapshot, activePath: displayFile?.path ?? activePath, files: displaySnapshot.files, entrypoint: displaySnapshot.entrypoint, stdin: snapshot.stdin, run, history, historyView, displaySource: displayFile?.content ?? '', displayStdin: displaySnapshot.stdin, displayRun: historyView?.run ?? run, error, setActivePath, changeSource, changeStdin, addFile, renameFile, deleteFile, setEntrypoint, save, start, stop, selectHistory, exitHistoryView };
}
