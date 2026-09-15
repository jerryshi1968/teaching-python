import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, FileCode2, Folder, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { ProjectOrganizer } from '@tigao/organizer-react';
import { createDemoOrganizerAdapter } from './demo-organizer-adapter.mjs';
import { useLanguage } from './i18n/LanguageContext.jsx';
import LanguageSelect from './i18n/LanguageSelect.jsx';
import CodeEditor from './CodeEditor.jsx';
import { createApiClient, createPythonApi } from './api.mjs';
import { createProjectOrganizerAdapter } from './project-organizer-adapter.mjs';
import { useProjectEditor } from './useProjectEditor.js';
import { useClassBoard } from './useClassBoard.js';

const organizerIcons = {
  group: <Folder aria-hidden="true" />,
  project: <FileCode2 aria-hidden="true" />,
  drag: <GripVertical aria-hidden="true" />,
  up: <ArrowUp aria-hidden="true" />,
  down: <ArrowDown aria-hidden="true" />,
  rename: <Pencil aria-hidden="true" />,
  move: <ArrowRight aria-hidden="true" />,
  delete: <Trash2 aria-hidden="true" />,
  add: <Plus aria-hidden="true" />
};

const organizerMessages = {
  zh: { title: '我的创意工坊', root: '根作品组', groups: '作品组', projects: '作品', createGroup: '新建作品组', createProject: '动手做个新作品', groupName: '作品组名称', projectName: '作品名称', open: '打开', rename: '重命名', move: '移动', delete: '删除', moveUp: '上移', moveDown: '下移', drag: '拖动排序', dropInside: '放入作品组', loading: '正在加载…', loadingTargets: '正在加载目标…', empty: '你的作品还是空空的哦！', readOnly: '只读', saving: '正在保存…', retry: '重试', cancel: '取消', confirm: '确定', renameTitle: '重命名', moveTitle: '移动作品', deleteTitle: '删除确认', deleteQuestion: '确定要删除“{name}”吗？', chooseDestination: '选择目标位置', structureBlocked: '作品组结构有误', noDestinations: '没有可移动的目标' },
  en: { title: 'My Creative Studio', root: 'Root', groups: 'Groups', projects: 'Projects', createGroup: 'New group', createProject: 'Create a project', groupName: 'Group name', projectName: 'Project name', open: 'Open', rename: 'Rename', move: 'Move', delete: 'Delete', moveUp: 'Move up', moveDown: 'Move down', drag: 'Drag to reorder', dropInside: 'Move into group', loading: 'Loading…', loadingTargets: 'Loading destinations…', empty: 'No projects here yet', readOnly: 'Read only', saving: 'Saving…', retry: 'Retry', cancel: 'Cancel', confirm: 'Confirm', renameTitle: 'Rename', moveTitle: 'Move project', deleteTitle: 'Confirm deletion', deleteQuestion: 'Delete “{name}”?', chooseDestination: 'Choose a destination', structureBlocked: 'The group structure is invalid', noDestinations: 'No destination is available' }
};

export default function App() {
  const { language } = useLanguage();
  const [folderId, setFolderId] = useState(null);
  const [openedProject, setOpenedProject] = useState(null);
  const [notice, setNotice] = useState('');
  const [organizerVersion, setOrganizerVersion] = useState(0);
  const [createKind, setCreateKind] = useState(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);
  const request = useMemo(() => createApiClient({ getLanguage: () => languageRef.current }), []);
  const api = useMemo(() => createPythonApi({ getLanguage: () => languageRef.current }), []);
  const editor = useProjectEditor({ projectId: openedProject, api, demoMode: import.meta.env.DEV });
  const classroom = useClassBoard({ api, demoMode: import.meta.env.DEV });
  useEffect(() => { setNotice(editor.error?.message ?? ''); }, [editor.error]);
  useEffect(() => { if (classroom.error) setNotice(classroom.error.message); }, [classroom.error]);
  const adapter = useMemo(() => {
    const openProject = (id) => { setOpenedProject(id); };
    return import.meta.env.DEV
      ? createDemoOrganizerAdapter(openProject)
      : createProjectOrganizerAdapter({ api: request, navigate: openProject });
  }, [request]);
  const openCreateDialog = (kind) => { setCreateName(''); setCreateKind(kind); };
  const submitCreate = async (event) => {
    event.preventDefault();
    const name = createName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      if (createKind === 'group') await adapter.createGroup({ name, parentId: folderId });
      else await adapter.createProject({ name, parentId: folderId });
      setCreateKind(null);
      setOrganizerVersion((value) => value + 1);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setCreating(false);
    }
  };  const activeMessages = organizerMessages[language];

  if (openedProject) return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/teaching-python/" aria-label="Python creative workshop"><span className="brand-mark">{`{}`}</span><span>{language === 'en' ? 'Python Creative Workshop' : 'Python 创意编程乐园'}</span></a>
      <div className="topbar-actions"><LanguageSelect /><a className="platform-link" href="#demo">p5.js 平台 ↗</a><span className="avatar">M</span><span className="account">Mr.Shi<small>{language === 'en' ? 'Teacher' : '教师'}</small></span></div>
    </header>
    <section className="page-content editor-page">
      {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      <CodeEditor language={language} projectId={openedProject} version={editor.project?.version} files={editor.files} activePath={editor.activePath} entrypoint={editor.entrypoint} source={editor.displaySource} stdin={editor.displayStdin} run={editor.displayRun} history={editor.history} historyView={editor.historyView} onSelectHistory={editor.selectHistory} onExitHistoryView={editor.exitHistoryView} readOnly={editor.project?.readOnly || classroom.studentId !== 'me'} onActivePathChange={editor.setActivePath} onAddFile={editor.addFile} onRenameFile={editor.renameFile} onDeleteFile={editor.deleteFile} onSetEntrypoint={editor.setEntrypoint} onSourceChange={editor.changeSource} onStdinChange={editor.changeStdin} onClose={() => setOpenedProject(null)} onSave={() => void editor.save().catch(() => {})} onRun={() => void editor.start().catch(() => {})} onStop={() => void editor.stop().catch(() => {})} />
    </section>
  </main>;

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="/teaching-python/" aria-label="Python creative workshop"><span className="brand-mark">{`{}`}</span><span>{language === 'en' ? 'Python Creative Workshop' : 'Python 创意编程乐园'}</span></a>
      <div className="topbar-actions"><LanguageSelect /><a className="platform-link" href="#demo">p5.js 平台 ↗</a><span className="avatar">M</span><span className="account">Mr.Shi<small>{language === 'en' ? 'Teacher' : '教师'}</small></span></div>
    </header>
    <section className="page-content">
      <section className="class-panel" aria-label="Class and student selector">
        <div className="class-heading"><span>♙</span><strong>{language === 'en' ? 'Class student project board' : '班级学生作品督导看板'}</strong></div>
        <label className="class-select">{language === 'en' ? 'Class' : '班级'}<select value={classroom.classId ?? ''} onChange={(event) => classroom.setClassId(event.target.value)}>{classroom.classes.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.id}</option>)}</select></label>
        <p>{language === 'en' ? 'Current class' : '当前班级'}：{classroom.classes.find((item) => item.id === classroom.classId)?.name ?? '—'}</p>
        <div className="student-tabs">{classroom.students.map((item) => <button key={item.studentId} type="button" className={`student ${classroom.studentId === item.studentId ? 'active' : ''}`} onClick={() => classroom.setStudentId(item.studentId)}>♟ {item.studentId === 'me' ? (language === 'en' ? 'Me (my projects)' : '我（我的项目）') : (item.name ?? item.username ?? item.studentId)}</button>)}</div>
      </section>
      <section className="studio-heading"><div><h1>🎨 {language === 'en' ? 'My Creative Studio' : '我的创意工坊'} <span>✦</span></h1><p>{language === 'en' ? 'Build a little program and make ideas happen.' : '在这里收集你所有的精彩想法，开始天马行空的创意代码吧！'}</p></div><div className="studio-actions"><button type="button" className="secondary" onClick={() => openCreateDialog('group')}>{organizerIcons.group} {language === 'en' ? 'New group' : '新建作品组'}</button><button type="button" className="primary" onClick={() => openCreateDialog('project')}>{organizerIcons.add} {language === 'en' ? 'Create a project' : '动手做个新作品'}</button></div></section>
      {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}
      {createKind && <div className="create-modal-backdrop" role="presentation"><form className="create-modal" onSubmit={(event) => void submitCreate(event)}><h2>{createKind === 'group' ? (language === 'en' ? 'New group' : '新建作品组') : (language === 'en' ? 'Create a project' : '动手做个新作品')}</h2><label>{createKind === 'group' ? (language === 'en' ? 'Group name' : '作品组名称') : (language === 'en' ? 'Project name' : '作品名称')}<input autoFocus value={createName} maxLength="100" onChange={(event) => setCreateName(event.target.value)} /></label><div className="create-modal-actions"><button type="button" className="secondary" onClick={() => setCreateKind(null)}>{language === 'en' ? 'Cancel' : '取消'}</button><button type="submit" className="primary" disabled={!createName.trim() || creating}>{creating ? (language === 'en' ? 'Creating…' : '正在新建…') : (language === 'en' ? 'Confirm' : '确定')}</button></div></form></div>}
      {openedProject && <CodeEditor language={language} projectId={openedProject} version={editor.project?.version} files={editor.files} activePath={editor.activePath} entrypoint={editor.entrypoint} source={editor.displaySource} stdin={editor.displayStdin} run={editor.displayRun} history={editor.history} historyView={editor.historyView} onSelectHistory={editor.selectHistory} onExitHistoryView={editor.exitHistoryView} readOnly={editor.project?.readOnly || classroom.studentId !== 'me'} onActivePathChange={editor.setActivePath} onAddFile={editor.addFile} onRenameFile={editor.renameFile} onDeleteFile={editor.deleteFile} onSetEntrypoint={editor.setEntrypoint} onSourceChange={editor.changeSource} onStdinChange={editor.changeStdin} onClose={() => setOpenedProject(null)} onSave={() => void editor.save().catch(() => {})} onRun={() => void editor.start().catch(() => {})} onStop={() => void editor.stop().catch(() => {})} />}
      <section className="organizer-wrap"><ProjectOrganizer key={organizerVersion} adapter={adapter} ownerId={classroom.studentId === 'me' ? null : classroom.studentId} currentParentId={folderId} onCurrentParentIdChange={setFolderId} messages={activeMessages} icons={organizerIcons} renderProjectExtraActions={() => <span className="python-badge">Python</span>} /></section>
    </section>
  </main>;
}
