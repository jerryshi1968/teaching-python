export default function CodeEditor({ language, projectId, source, stdin, run, history = [], readOnly = false, onSourceChange, onStdinChange, onSave, onRun, onStop, onClose }) {
  const text = language === 'en' ? {
    back: 'Back to projects', save: 'Save', run: 'Run', stop: 'Stop', source: 'main.py', stdin: 'Standard input', stdout: 'Standard output', stderr: 'Standard error', history: 'Recent runs', idle: 'Ready to run'
  } : {
    back: '返回作品列表', save: '保存', run: '运行', stop: '停止', source: 'main.py', stdin: '标准输入', stdout: '标准输出', stderr: '标准错误', history: '最近运行', idle: '准备运行'
  };
  const busy = run?.status === 'queued' || run?.status === 'running';
  return <section className="editor-shell" aria-label={text.source}>
    <div className="editor-toolbar"><button type="button" className="editor-back" onClick={onClose}>← {text.back}</button><strong>{projectId}</strong><div className="editor-actions">{!readOnly && <button type="button" className="secondary" onClick={onSave}>{text.save}</button>}{!readOnly && <button type="button" className="primary" onClick={onRun} disabled={busy}>▶ {text.run}</button>}{!readOnly && busy && <button type="button" className="secondary" onClick={onStop}>■ {text.stop}</button>}</div></div>
    <div className="editor-grid">
      <label className="code-panel"><span>{text.source}</span><textarea value={source} spellCheck="false" readOnly={readOnly} onChange={(event) => onSourceChange(event.target.value)} /></label>
      <div className="result-column">
        <label className="input-panel"><span>{text.stdin}</span><textarea value={stdin} readOnly={readOnly} onChange={(event) => onStdinChange(event.target.value)} /></label>
        <section className="output-panel"><div><span>{text.stdout}</span><small>{run?.status ?? text.idle}</small></div><pre>{run?.stdout ?? ''}</pre></section>
        <section className="output-panel error"><div><span>{text.stderr}</span></div><pre>{run?.stderr ?? ''}</pre></section>
        <section className="history-panel"><span>{text.history}</span>{history.length ? history.map((item) => <p key={item.id}>{item.id} · {item.status}</p>) : <p>{run ? `${run.id} · ${run.status}` : text.idle}</p>}</section>
      </div>
    </div>
  </section>;
}