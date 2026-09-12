import { AppError, notFound } from './errors.mjs';

export const PYTHON_PROJECT_TYPE = 'python';

function copy(value) {
  return structuredClone(value);
}

function makeId(prefix, sequence) {
  return `${prefix}_${sequence}`;
}

export class PythonRepository {
  #data;
  #sequence = 0;

  constructor(seed = {}) {
    this.#data = {
      projects: copy(seed.projects ?? []),
      groups: copy(seed.groups ?? []),
      versions: copy(seed.versions ?? []),
      runs: copy(seed.runs ?? []),
      distributions: copy(seed.distributions ?? []),
      classes: copy(seed.classes ?? []),
      enrollments: copy(seed.enrollments ?? [])
    };
  }

  async transaction(operation) {
    const snapshot = copy(this.#data);
    const sequence = this.#sequence;
    try {
      return await operation();
    } catch (error) {
      this.#data = snapshot;
      this.#sequence = sequence;
      throw error;
    }
  }

  #nextId(prefix) {
    this.#sequence += 1;
    if (prefix === 'group') return this.#sequence;
    return makeId(prefix, this.#sequence);
  }

  #ownedGroup(ownerId, id) {
    const group = this.#data.groups.find((item) => item.id === id && item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE);
    if (!group) throw notFound();
    return group;
  }

  #assertParent(ownerId, parentId) {
    if (parentId !== null) this.#ownedGroup(ownerId, parentId);
  }

  async listWorkspace(ownerId, parentId = null) {
    this.#assertParent(ownerId, parentId);
    return {
      groups: copy(this.#data.groups.filter((item) => item.ownerId === ownerId && item.parentId === parentId && item.projectType === PYTHON_PROJECT_TYPE)),
      projects: copy(this.#data.projects.filter((item) => item.ownerId === ownerId && item.parentId === parentId && item.projectType === PYTHON_PROJECT_TYPE))
    };
  }

  async listAllGroups(ownerId) {
    return copy(this.#data.groups.filter((item) => item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE));
  }

  async createGroup({ ownerId, name, parentId = null }) {
    this.#assertParent(ownerId, parentId);
    const group = { id: this.#nextId('group'), ownerId, name, parentId, position: Date.now(), projectType: PYTHON_PROJECT_TYPE };
    this.#data.groups.push(group);
    return copy(group);
  }

  async createProject({ ownerId, name, parentId = null, source = '', stdin = '' }) {
    this.#assertParent(ownerId, parentId);
    const project = { id: this.#nextId('project'), ownerId, name, parentId, position: Date.now(), projectType: PYTHON_PROJECT_TYPE, version: 1, source, stdin };
    this.#data.projects.push(project);
    this.#data.versions.push({ id: this.#nextId('version'), projectId: project.id, version: 1, source, stdin, projectType: PYTHON_PROJECT_TYPE });
    return copy(project);
  }

  async getProject(id) {
    const project = this.#data.projects.find((item) => item.id === id && item.projectType === PYTHON_PROJECT_TYPE);
    if (!project) throw notFound();
    return copy(project);
  }

  async updateProjectSource({ id, ownerId, source, stdin, version }) {
    const project = this.#data.projects.find((item) => item.id === id && item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE);
    if (!project) throw notFound();
    if (project.version !== version) throw new AppError(409, 'VERSION_CONFLICT', 'The project has changed on the server.');
    if (project.source === source && project.stdin === stdin) return copy(project);
    project.source = source;
    project.stdin = stdin;
    project.version += 1;
    this.#data.versions.push({ id: this.#nextId('version'), projectId: project.id, version: project.version, source, stdin, projectType: PYTHON_PROJECT_TYPE });
    return copy(project);
  }

  async rename({ kind, id, ownerId, name }) {
    const records = kind === 'project' ? this.#data.projects : kind === 'group' ? this.#data.groups : null;
    if (!records) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be renamed.');
    const item = records.find((record) => record.id === id && record.ownerId === ownerId && record.projectType === PYTHON_PROJECT_TYPE);
    if (!item) throw notFound();
    item.name = name;
    return copy(item);
  }

  async delete({ kind, id, ownerId }) {
    const records = kind === 'project' ? this.#data.projects : kind === 'group' ? this.#data.groups : null;
    if (!records) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be deleted.');
    const index = records.findIndex((item) => item.id === id && item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE);
    if (index < 0) throw notFound();
    if (kind === 'group' && (this.#data.groups.some((item) => item.parentId === id) || this.#data.projects.some((item) => item.parentId === id))) {
      throw new AppError(409, 'GROUP_NOT_EMPTY', 'A non-empty group cannot be deleted.');
    }
    records.splice(index, 1);
  }

  async move({ kind, id, ownerId, parentId }) {
    const records = kind === 'project' ? this.#data.projects : kind === 'group' ? this.#data.groups : null;
    if (!records) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be moved.');
    const item = records.find((record) => record.id === id && record.ownerId === ownerId && record.projectType === PYTHON_PROJECT_TYPE);
    if (!item) throw notFound();
    this.#assertParent(ownerId, parentId);
    if (kind === 'group' && (parentId === id || this.#isDescendant(id, parentId))) {
      throw new AppError(409, 'INVALID_GROUP_MOVE', 'A group cannot be moved into itself or one of its children.');
    }
    item.parentId = parentId;
    item.position = Date.now();
    return copy(item);
  }

  #isDescendant(ancestorId, candidateId) {
    let current = candidateId;
    while (current !== null) {
      if (current === ancestorId) return true;
      current = this.#data.groups.find((item) => item.id === current && item.projectType === PYTHON_PROJECT_TYPE)?.parentId ?? null;
    }
    return false;
  }

  async createRun({ project, ownerId, requestId = null }) {
    const existing = requestId ? this.#data.runs.find((item) => item.ownerId === ownerId && item.requestId === requestId && item.projectType === PYTHON_PROJECT_TYPE) : null;
    if (existing) return copy(existing);
    const run = {
      id: this.#nextId('run'),
      projectId: project.id,
      ownerId,
      requestId,
      version: project.version,
      source: project.source,
      stdin: project.stdin,
      status: 'queued',
      createdAt: new Date().toISOString(),
      projectType: PYTHON_PROJECT_TYPE
    };
    this.#data.runs.push(run);
    return copy(run);
  }

  async getRun(id) {
    const run = this.#data.runs.find((item) => item.id === id && item.projectType === PYTHON_PROJECT_TYPE);
    if (!run) throw notFound();
    return copy(run);
  }

  async updateRunResult({ id, status, stdout = '', stderr = '' }) {
    const run = this.#data.runs.find((item) => item.id === id && item.projectType === PYTHON_PROJECT_TYPE);
    if (!run) throw notFound();
    run.status = status;
    run.stdout = stdout;
    run.stderr = stderr;
    if (status !== 'queued' && status !== 'running') run.completedAt = new Date().toISOString();
    return copy(run);
  }
  async listRuns(projectId) {
    return copy(this.#data.runs.filter((item) => item.projectId === projectId && item.projectType === PYTHON_PROJECT_TYPE));
  }
  async distributeProject({ project, teacherId, classId, requestId }) {
    const classroom = this.#data.classes.find((item) => item.id === classId && item.teacherId === teacherId);
    if (!classroom) throw notFound();
    const existing = this.#data.distributions.filter((item) => item.projectId === project.id && item.classId === classId && item.requestId === requestId && item.projectType === PYTHON_PROJECT_TYPE);
    if (existing.length) return existing.map((item) => copy(this.#data.projects.find((projectItem) => projectItem.id === item.distributedProjectId)));
    const recipients = this.#data.enrollments.filter((item) => item.classId === classId);
    const copies = [];
    for (const recipient of recipients) {
      const copied = await this.createProject({ ownerId: recipient.studentId, name: project.name, source: project.source, stdin: project.stdin });
      this.#data.distributions.push({ projectId: project.id, classId, requestId, studentId: recipient.studentId, distributedProjectId: copied.id, projectType: PYTHON_PROJECT_TYPE });
      copies.push(copied);
    }
    return copies;
  }
  async listTeacherClasses(teacherId) {
    return copy(this.#data.classes.filter((item) => item.teacherId === teacherId));
  }

  async listClassStudents(teacherId, classId) {
    const classroom = this.#data.classes.find((item) => item.id === classId && item.teacherId === teacherId);
    if (!classroom) throw notFound();
    return copy(this.#data.enrollments.filter((item) => item.classId === classId));
  }
  async canTeacherView(teacherId, studentId) {
    const classIds = this.#data.classes.filter((item) => item.teacherId === teacherId).map((item) => item.id);
    return this.#data.enrollments.some((item) => item.studentId === studentId && classIds.includes(item.classId));
  }
}
