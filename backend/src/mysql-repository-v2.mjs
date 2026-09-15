import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppError, notFound } from './errors.mjs';
import { validateSnapshot } from './validation.mjs';

const type = 'python';
const now = () => new Date();
const projectColumns = 'p.id,p.user_id,p.name,p.parent_id,p.sort_order,d.revision_id,d.version,r.source_bytes,p.created_at,p.updated_at';
const project = row => row && ({ id: row.id, ownerId: row.user_id, name: row.name, parentId: row.parent_id, position: row.sort_order, revisionId: row.revision_id, version: Number(row.version), sourceBytes: Number(row.source_bytes), projectType: type });
const group = row => row && ({ id: row.id, ownerId: row.user_id, name: row.name, parentId: row.parent_id, position: row.sort_order, projectType: type });
const run = row => row && ({ id: row.id, ownerId: row.user_id, projectId: row.project_id, requestId: row.request_id, revisionId: row.revision_id, version: Number(row.version), status: row.status, stdout: row.stdout, stderr: row.stderr, createdAt: row.created_at?.toISOString(), completedAt: row.completed_at?.toISOString(), projectType: type });

export class MysqlPythonRepository {
  #pool;
  #connection;
  #sources;

  constructor(pool, sources, connection = null) {
    this.#pool = pool;
    this.#connection = connection;
    this.#sources = sources;
  }

  #db() {
    return this.#connection || this.#pool;
  }

  async #one(sql, values, mapper = value => value) {
    const [rows] = await this.#db().execute(sql, values);
    return rows[0] ? mapper(rows[0]) : null;
  }

  async #nextSortOrder(table, ownerId, parentId) {
    const row = await this.#one(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM ${table} WHERE user_id=? AND project_type=? AND parent_id <=> ?`, [ownerId, type, parentId]);
    return Number(row.value);
  }

  async transaction(operation) {
    if (this.#connection) return operation(this);
    const connection = await this.#pool.getConnection();
    const transactionRepository = new MysqlPythonRepository(this.#pool, this.#sources, connection);
    try {
      await connection.beginTransaction();
      const result = await operation(transactionRepository);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async #ownedGroup(ownerId, id) {
    const item = await this.#one('SELECT * FROM project_groups WHERE id=? AND user_id=? AND project_type=?', [id, ownerId, type], group);
    if (!item) throw notFound();
    return item;
  }

  async #parent(ownerId, parentId) {
    if (parentId !== null) await this.#ownedGroup(ownerId, parentId);
  }

  async #metadata(id, ownerId = null) {
    const values = [id, type];
    let ownerClause = '';
    if (ownerId !== null) {
      ownerClause = ' AND p.user_id=?';
      values.push(ownerId);
    }
    const item = await this.#one(`SELECT ${projectColumns} FROM projects p JOIN python_documents d ON d.project_id=p.id JOIN python_revisions r ON r.id=d.revision_id AND r.project_id=p.id WHERE p.id=? AND p.project_type=?${ownerClause}`, values, project);
    if (!item) throw notFound();
    return item;
  }

  async #hydrate(item) {
    const snapshot = await this.#sources.read(item.revisionId);
    const entry = snapshot.files.find((file) => file.path === snapshot.entrypoint);
    return { ...item, ...snapshot, source: entry?.content ?? '' };
  }

  async #syncFiles(projectId, files) {
    const [rows] = await this.#db().execute("SELECT f.path FROM files f WHERE f.project_id=? AND EXISTS (SELECT 1 FROM projects p WHERE p.id=f.project_id AND p.project_type='python')", [projectId]);
    const wanted = new Set(files.map((file) => file.path));
    for (const row of rows) {
      if (!wanted.has(row.path)) {
        await this.#db().execute("DELETE f FROM files f JOIN projects p ON p.id=f.project_id WHERE f.project_id=? AND f.path=? AND p.project_type='python'", [projectId, row.path]);
      }
    }
    for (const file of files) {
      const existing = rows.some((row) => row.path === file.path);
      if (existing) {
        await this.#db().execute("UPDATE files f JOIN projects p ON p.id=f.project_id SET f.name=?,f.updated_at=? WHERE f.project_id=? AND f.path=? AND p.project_type='python'", [basename(file.path), now(), projectId, file.path]);
      } else {
        await this.#db().execute("INSERT INTO files(project_id,name,path,created_at,updated_at) SELECT id,?,?,?,? FROM projects WHERE id=? AND project_type='python'", [basename(file.path), file.path, now(), now(), projectId]);
      }
    }
  }

  async listWorkspace(ownerId, parentId = null) {
    await this.#parent(ownerId, parentId);
    const [groups, projects] = await Promise.all([
      this.#db().execute('SELECT * FROM project_groups WHERE user_id=? AND project_type=? AND parent_id <=> ? ORDER BY sort_order,id', [ownerId, type, parentId]),
      this.#db().execute(`SELECT ${projectColumns} FROM projects p JOIN python_documents d ON d.project_id=p.id JOIN python_revisions r ON r.id=d.revision_id AND r.project_id=p.id WHERE p.user_id=? AND p.project_type=? AND p.parent_id <=> ? ORDER BY p.sort_order,p.id`, [ownerId, type, parentId])
    ]);
    return { groups: groups[0].map(group), projects: projects[0].map(project) };
  }

  async listAllGroups(ownerId) {
    const [rows] = await this.#db().execute('SELECT * FROM project_groups WHERE user_id=? AND project_type=? ORDER BY sort_order,id', [ownerId, type]);
    return rows.map(group);
  }

  async createGroup({ ownerId, name, parentId = null }) {
    await this.#parent(ownerId, parentId);
    const sortOrder = await this.#nextSortOrder('project_groups', ownerId, parentId);
    const [result] = await this.#db().execute('INSERT INTO project_groups(user_id,name,parent_id,sort_order,project_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', [ownerId, name, parentId, sortOrder, type, now(), now()]);
    return this.#ownedGroup(ownerId, result.insertId);
  }

  async createProject({ ownerId, name, parentId = null, snapshot, source = '', stdin = '', revisionId = randomUUID() }) {
    await this.#parent(ownerId, parentId);
    const content = validateSnapshot(snapshot ?? { source, stdin });
    const id = randomUUID();
    await this.#sources.write(revisionId, content);
    try {
      const sortOrder = await this.#nextSortOrder('projects', ownerId, parentId);
      await this.#db().execute('INSERT INTO projects(id,user_id,name,parent_id,sort_order,project_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', [id, ownerId, name, parentId, sortOrder, type, now(), now()]);
      await this.#db().execute('INSERT INTO python_revisions(id,project_id,user_id,source_bytes,created_at) VALUES(?,?,?,?,?)', [revisionId, id, ownerId, Buffer.byteLength(JSON.stringify(content)), now()]);
      await this.#db().execute('INSERT INTO python_documents(project_id,revision_id,version,created_at,updated_at) VALUES(?,?,1,?,?)', [id, revisionId, now(), now()]);
      await this.#syncFiles(id, content.files);
      return this.getProject(id);
    } catch (error) {
      await this.#sources.removeEventually(revisionId);
      throw error;
    }
  }

  async getProject(id) {
    return this.#hydrate(await this.#metadata(id));
  }

  async updateProjectSource({ id, ownerId, snapshot, source, stdin, version, revisionId = randomUUID() }) {
    const current = await this.#metadata(id, ownerId);
    if (current.version !== version) throw new AppError(409, 'VERSION_CONFLICT', 'The project has changed on the server.');
    const content = validateSnapshot(snapshot ?? { source, stdin });
    const previous = await this.#sources.read(current.revisionId);
    if (JSON.stringify(previous) === JSON.stringify(content)) return this.#hydrate(current);
    await this.#sources.write(revisionId, content);
    try {
      await this.#db().execute('INSERT INTO python_revisions(id,project_id,user_id,source_bytes,created_at) VALUES(?,?,?,?,?)', [revisionId, id, ownerId, Buffer.byteLength(JSON.stringify(content)), now()]);
      const [result] = await this.#db().execute("UPDATE python_documents d JOIN projects p ON p.id=d.project_id SET d.revision_id=?,d.version=d.version+1,d.updated_at=?,p.updated_at=? WHERE p.id=? AND p.user_id=? AND p.project_type='python' AND d.version=?", [revisionId, now(), now(), id, ownerId, version]);
      if (!result.affectedRows) throw new AppError(409, 'VERSION_CONFLICT', 'The project has changed on the server.');
      await this.#syncFiles(id, content.files);
      return this.getProject(id);
    } catch (error) {
      await this.#sources.removeEventually(revisionId);
      throw error;
    }
  }

  async rename({ kind, id, ownerId, name }) {
    const table = kind === 'project' ? 'projects' : kind === 'group' ? 'project_groups' : null;
    if (!table) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be renamed.');
    const [result] = await this.#db().execute(`UPDATE ${table} SET name=?,updated_at=? WHERE id=? AND user_id=? AND project_type=?`, [name, now(), id, ownerId, type]);
    if (!result.affectedRows) throw notFound();
    return kind === 'project' ? this.getProject(id) : this.#ownedGroup(ownerId, id);
  }

  async delete({ kind, id, ownerId }) {
    const table = kind === 'project' ? 'projects' : kind === 'group' ? 'project_groups' : null;
    if (!table) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be deleted.');
    if (kind === 'group') {
      const [[childGroups], [childProjects]] = await Promise.all([
        this.#db().execute("SELECT 1 FROM project_groups WHERE parent_id=? AND project_type='python' LIMIT 1", [id]),
        this.#db().execute("SELECT 1 FROM projects WHERE parent_id=? AND project_type='python' LIMIT 1", [id])
      ]);
      if (childGroups.length || childProjects.length) throw new AppError(409, 'GROUP_NOT_EMPTY', 'A non-empty group cannot be deleted.');
      const [result] = await this.#db().execute("DELETE FROM project_groups WHERE id=? AND user_id=? AND project_type='python'", [id, ownerId]);
      if (!result.affectedRows) throw notFound();
      return { revisionIds: [] };
    }
    await this.#metadata(id, ownerId);
    const [revisionRows] = await this.#db().execute("SELECT r.id FROM python_revisions r JOIN projects p ON p.id=r.project_id WHERE r.project_id=? AND p.user_id=? AND p.project_type='python'", [id, ownerId]);
    await this.#db().execute("DELETE f FROM files f JOIN projects p ON p.id=f.project_id WHERE f.project_id=? AND p.user_id=? AND p.project_type='python'", [id, ownerId]);
    await this.#db().execute("DELETE r FROM python_runs r JOIN projects p ON p.id=r.project_id WHERE r.project_id=? AND p.user_id=? AND p.project_type='python'", [id, ownerId]);
    await this.#db().execute("DELETE d FROM python_documents d JOIN projects p ON p.id=d.project_id WHERE d.project_id=? AND p.user_id=? AND p.project_type='python'", [id, ownerId]);
    await this.#db().execute("DELETE r FROM python_revisions r JOIN projects p ON p.id=r.project_id WHERE r.project_id=? AND p.user_id=? AND p.project_type='python'", [id, ownerId]);
    const [result] = await this.#db().execute("DELETE FROM projects WHERE id=? AND user_id=? AND project_type='python'", [id, ownerId]);
    if (!result.affectedRows) throw notFound();
    return { revisionIds: revisionRows.map((row) => row.id) };
  }

  async removeSnapshots(revisionIds) {
    const results = await Promise.all(revisionIds.map((revisionId) => this.#sources.removeEventually(revisionId)));
    return results.every(Boolean);
  }

  async move({ kind, id, ownerId, parentId }) {
    await this.#parent(ownerId, parentId);
    const table = kind === 'project' ? 'projects' : kind === 'group' ? 'project_groups' : null;
    if (!table) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be moved.');
    if (kind === 'group' && String(id) === String(parentId)) throw new AppError(409, 'INVALID_GROUP_MOVE', 'A group cannot be moved into itself or one of its children.');
    const sortOrder = await this.#nextSortOrder(table, ownerId, parentId);
    const [result] = await this.#db().execute(`UPDATE ${table} SET parent_id=?,sort_order=?,updated_at=? WHERE id=? AND user_id=? AND project_type=?`, [parentId, sortOrder, now(), id, ownerId, type]);
    if (!result.affectedRows) throw notFound();
    return kind === 'project' ? this.getProject(id) : this.#ownedGroup(ownerId, id);
  }

  async createRun({ project: item, ownerId, requestId = null }) {
    if (requestId) {
      const existing = await this.#one("SELECT r.* FROM python_runs r JOIN projects p ON p.id=r.project_id WHERE r.user_id=? AND r.request_id=? AND p.project_type='python'", [ownerId, requestId], run);
      if (existing) return existing;
    }
    const id = randomUUID();
    await this.#db().execute('INSERT INTO python_runs(id,user_id,project_id,request_id,revision_id,version,status,stdout,stderr,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', [id, ownerId, item.id, requestId, item.revisionId, item.version, 'queued', '', '', now()]);
    await this.#db().execute("DELETE r FROM python_runs r JOIN projects p ON p.id=r.project_id WHERE r.project_id=? AND r.id<>? AND p.project_type='python' AND r.id NOT IN (SELECT id FROM (SELECT id FROM python_runs WHERE project_id=? AND id<>? ORDER BY created_at DESC LIMIT 19) AS retained)", [item.id, id, item.id, id]);
    return this.getRun(id);
  }

  async getRun(id) {
    const item = await this.#one("SELECT r.* FROM python_runs r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.project_type='python'", [id], run);
    if (!item) throw notFound();
    return item;
  }

  async getRevisionSnapshot(revisionId) {
    const revision = await this.#one("SELECT r.id FROM python_revisions r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.project_type='python'", [revisionId]);
    if (!revision) throw notFound();
    return this.#sources.read(revisionId);
  }

  async updateRunResult({ id, status, stdout = '', stderr = '' }) {
    const done = ['queued', 'running'].includes(status) ? null : now();
    const [result] = await this.#db().execute("UPDATE python_runs r JOIN projects p ON p.id=r.project_id SET r.status=?,r.stdout=?,r.stderr=?,r.completed_at=? WHERE r.id=? AND p.project_type='python'", [status, stdout, stderr, done, id]);
    if (!result.affectedRows) throw notFound();
    return this.getRun(id);
  }

  async listRuns(projectId) {
    const [rows] = await this.#db().execute("SELECT r.* FROM python_runs r JOIN projects p ON p.id=r.project_id WHERE r.project_id=? AND p.project_type='python' ORDER BY r.created_at DESC LIMIT 20", [projectId]);
    return rows.map(run);
  }

  async user(id) {
    const item = await this.#one('SELECT id,username,role FROM users WHERE id=?', [id]);
    if (!item) throw notFound();
    return { id: item.id, username: item.username, role: item.role };
  }

  async listTeacherClasses(teacherId) {
    const [rows] = await this.#db().execute('SELECT id,name,class_code FROM classes WHERE teacher_user_id=? ORDER BY id', [teacherId]);
    return rows.map(row => ({ id: row.id, name: row.name, classCode: row.class_code, teacherId }));
  }

  async listClassStudents(teacherId, classId) {
    const [rows] = await this.#db().execute('SELECT u.id,u.username FROM users u JOIN classes c ON c.class_code=u.class_code WHERE c.id=? AND c.teacher_user_id=? ORDER BY u.id', [classId, teacherId]);
    if (!rows.length) {
      const classroom = await this.#one('SELECT id FROM classes WHERE id=? AND teacher_user_id=?', [classId, teacherId]);
      if (!classroom) throw notFound();
    }
    return rows.map(row => ({ classId, studentId: row.id, username: row.username }));
  }

  async canTeacherView(teacherId, studentId) {
    const item = await this.#one('SELECT 1 AS allowed FROM classes c JOIN users u ON u.class_code=c.class_code WHERE c.teacher_user_id=? AND u.id=? LIMIT 1', [teacherId, studentId]);
    return Boolean(item);
  }

  async distributeProject({ project: item, teacherId, classId, requestId }) {
    const students = await this.listClassStudents(teacherId, classId);
    const [existing] = await this.#db().execute("SELECT d.copied_project_id FROM python_distributions d JOIN projects p ON p.id=d.source_project_id WHERE d.teacher_user_id=? AND d.request_id=? AND p.project_type='python' ORDER BY d.recipient_user_id", [teacherId, requestId]);
    if (existing.length) return Promise.all(existing.map(row => this.getProject(row.copied_project_id)));
    const snapshot = validateSnapshot(item);
    const copies = [];
    for (const student of students) {
      const copied = await this.createProject({ ownerId: student.studentId, name: item.name, snapshot });
      await this.#db().execute('INSERT INTO python_distributions(id,teacher_user_id,source_project_id,class_id,request_id,recipient_user_id,copied_project_id,created_at) VALUES(?,?,?,?,?,?,?,?)', [randomUUID(), teacherId, item.id, classId, requestId, student.studentId, copied.id, now()]);
      copies.push(copied);
    }
    return copies;
  }

  async close() {
    if (!this.#connection) await this.#pool.end();
  }
}
