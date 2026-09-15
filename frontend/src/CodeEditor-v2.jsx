import { useCallback, useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';

function formatRunStatus(status, language) {
  const labels = language === 'en'
    ? { queued: 'Queued', running: 'Running', completed: 'Completed', runtime_error: 'Runtime error', cancelled: 'Cancelled', time_limit: 'Time limit', output_limit: 'Output limit', system_error: 'System error' }
    : { queued: '排队中', running: '运行中', completed: '已完成', runtime_error: '运行错误', cancelled: '已取消', time_limit: '超时', output_limit: '输出超限', system_error: '系统错误' };
  return labels[status] ?? status;
}

function formatRunTime(value, language) {
  if (!value) return '';
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
}

export default function CodeEditor({ language, projectId, version, files = [], activePath, entrypoint, source, stdin, run, history = [], readOnly = false, historyView = null, onActivePathChange, onAddFile, onRenameFile, onDeleteFile, onSetEntrypoint, onSourceChange, onStdinChange, onSave, onRun, onStop, onSelectHistory, onExitHistoryView, onClose }) {
  const text = language === 'en' ? {
    back: 'Back to projects', save: 'Save', run: 'Run', stop: 'Stop', stdin: 'Standard input', results: 'Run results', stdout: 'Output', stderr: 'Errors', history: 'History', noOutput: 'Run the project to see its output here.', noError: 'No errors to display.', idle: 'Ready to run', backToDraft: 'Back to current draft', viewingHistory: 'Viewing historical run', files: 'Project files', add: 'New file', rename: 'Rename', remove: 'Delete', entrypoint: 'Entrypoint', setEntrypoint: 'Use as entrypoint', filePrompt: 'Enter a relative file path, for example helpers/message.py', deletePrompt: 'Delete this file?', version: 'Version'
  } : {
    back: '返回作品列表', save: '保存', run: '运行', stop: '停止', stdin: '标准输入', results: '运行结果', stdout: '输出', stderr: '错误', history: '历史', noOutput: '运行项目后，输出会显示在这里。', noError: '没有错误信息。', idle: '准备运行', backToDraft: '返回当前草稿', viewingHistory: '正在查看历史运行', files: '项目文件', add: '新建文件', rename: '重命名', remove: '删除', entrypoint: '入口', setEntrypoint: '设为入口', filePrompt: '请输入相对文件路径，例如 helpers/message.py', deletePrompt: '确定删除此文件吗？', version: '版本'
  };
  const busy = run?.status === 'queued' || run?.status === 'running';
  const viewingHistory = Boolean(historyView);
  const effectiveReadOnly = readOnly || viewingHistory;
  const [resultTab, setResultTab] = useState('output');
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const editorExtensions = useMemo(() => [python()], []);
  const handleEditorUpdate = useCallback((viewUpdate) => {
    const head = viewUpdate.state.selection.main.head;
    const line = viewUpdate.state.doc.lineAt(head);
    const next = { line: line.number, column: head - line.from + 1 };
    setCursorPosition((current) => current.line === next.line && current.column === next.column ? current : next);
  }, []);
  useEffect(() => {
    if (viewingHistory) return;
    if (busy) setResultTab('output');
    else if (run?.stderr) setResultTab('error');
  }, [busy, run?.id, run?.stderr, viewingHistory]);
  const cursorLabel = language === 'en' ? `Line ${cursorPosition.line}, Column ${cursorPosition.column}` : `第 ${cursorPosition.line} 行，第 ${cursorPosition.column} 列`;
  const displayVersion = historyView?.run.version ?? version;
  const promptForPath = (initial = '') => window.prompt(text.filePrompt, initial)?.trim();
  const runFileAction = (action) => {
    try {
      action();
    } catch (error) {
      window.alert(error.message);
    }
  };
  return <section className="editor-shell" aria-label={activePath}>
    <div className="editor-toolbar"><button type="button" className="editor-back" onClick={onClose}>← {text.back}</button><strong>{projectId}</strong><div className="editor-actions">{viewingHistory && <button type="button" className="secondary" onClick={onExitHistoryView}>{text.backToDraft}</button>}{!effectiveReadOnly && <button type="button" className="secondary" onClick={onSave}>{text.save}</button>}{!effectiveReadOnly && <button type="button" className="primary" onClick={onRun} disabled={busy}>▶ {text.run}</button>}{!effectiveReadOnly && busy && <button type="button" className="secondary" onClick={onStop}>■ {text.stop}</button>}</div></div>
    <div className="editor-grid">
      <div className="file-workspace">
        <aside className="file-sidebar">
          <div className="file-sidebar-heading"><span>{text.files}</span>{!effectiveReadOnly && <button type="button" title={text.add} onClick={() => { const path = promptForPath(); if (path) runFileAction(() => onAddFile(path)); }}>＋</button>}</div>
          <div className="file-list">{files.map((file) => <button key={file.path} type="button" className={`file-item ${file.path === activePath ? 'active' : ''}`} onClick={() => onActivePathChange(file.path)}><span>{file.path}</span>{file.path === entrypoint && <small>{text.entrypoint}</small>}</button>)}</div>
          {!effectiveReadOnly && <div className="file-actions"><button type="button" onClick={() => { const path = promptForPath(activePath); if (path && path !== activePath) runFileAction(() => onRenameFile(path)); }}>{text.rename}</button><button type="button" onClick={() => { if (window.confirm(text.deletePrompt)) runFileAction(onDeleteFile); }}>{text.remove}</button>{activePath?.endsWith('.py') && activePath !== entrypoint && <button type="button" onClick={onSetEntrypoint}>{text.setEntrypoint}</button>}</div>}
        </aside>
        <section className="code-panel"><span>{activePath}{viewingHistory && ` · ${text.viewingHistory}`}</span><div className="editor-frame"><CodeMirror className="python-code-editor" value={source} theme="dark" extensions={editorExtensions} editable={!effectiveReadOnly} readOnly={effectiveReadOnly} indentWithTab basicSetup={{ lineNumbers: true, highlightActiveLineGutter: true, foldGutter: true, indentOnInput: true, bracketMatching: true, closeBrackets: true, autocompletion: true, highlightActiveLine: true, highlightSelectionMatches: true }} aria-label={activePath} onChange={onSourceChange} onUpdate={handleEditorUpdate} /><div className="editor-statusbar"><span>{activePath} · UTF-8 · {cursorLabel}</span><span>{text.version} {displayVersion ?? '—'}</span></div></div></section>
      </div>
      <div className="result-column">
        <label className="input-panel"><span>{text.stdin}</span><textarea value={stdin} readOnly={effectiveReadOnly} onChange={(event) => onStdinChange(event.target.value)} /></label>
        <section className="result-panel"><div className="result-heading"><span>{text.results}</span><small>{run ? formatRunStatus(run.status, language) : text.idle}</small></div><div className="result-tabs" role="tablist" aria-label={text.results}>{['output', 'error', 'history'].map((tab) => <button key={tab} type="button" role="tab" aria-selected={resultTab === tab} className={resultTab === tab ? 'active' : ''} onClick={() => setResultTab(tab)}>{tab === 'output' ? text.stdout : tab === 'error' ? text.stderr : text.history}</button>)}</div><div className="result-tab-content" role="tabpanel">{resultTab === 'output' && (run?.stdout ? <pre>{run.stdout}</pre> : <p className="result-empty">{text.noOutput}</p>)}{resultTab === 'error' && (run?.stderr ? <pre className="error-output">{run.stderr}</pre> : <p className="result-empty">{text.noError}</p>)}{resultTab === 'history' && <div className="history-list">{history.length ? history.map((item) => <button key={item.id} type="button" className={`history-item ${historyView?.run.id === item.id ? 'active' : ''}`} onClick={() => void onSelectHistory(item.id).catch(() => {})}><strong>{formatRunTime(item.completedAt ?? item.createdAt, language)}</strong><small>{formatRunStatus(item.status, language)}</small></button>) : <p className="result-empty">{run ? `${run.id} · ${formatRunStatus(run.status, language)}` : text.idle}</p>}</div>}</div></section>
      </div>
    </div>
  </section>;
}
