import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppError, notFound } from './errors.mjs';
import { MemorySourceStore } from './source-store.mjs';
import { validateSnapshot } from './validation.mjs';

export const PYTHON_PROJECT_TYPE = 'python';

function copy(value) {
  return structuredClone(value);
}

function makeId(prefix, sequence) {
  return `${prefix}_${sequence}`;
}

function metadata(project) {
  const { source, stdin, files, entrypoint, schemaVersion, snapshot, ...result } = project;
  return result;
}

export class PythonRepository {
  #data;
  #sequence = 0;
  #sources;
  #ready;

  constructor(seed = {}, sources = new MemorySourceStore()) {
    this.#sources = sources;
    const snapshots = [];
    const projects = copy(seed.projects ?? []).map((project, index) => {
      if (project.projectType !== PYTHON_PROJECT_TYPE) return project;
      const revisionId = project.revisionId ?? `seed_revision_${index + 1}`;
      const snapshot = validateSnapshot(project.snapshot ?? { source: project.source ?? '', stdin: project.stdin ?? '' });
      snapshots.push([revisionId, snapshot]);
      return { ...metadata(project), revisionId, version: project.version ?? 1, sourceBytes: Buffer.byteLength(JSON.stringify(snapshot)) };
    });
    this.#data = {
      projects,
      groups: copy(seed.groups ?? []),
      revisions: projects.filter((item) => item.projectType === PYTHON_PROJECT_TYPE).map((item) => ({ id: item.revisionId, projectId: item.id, version: item.version, sourceBytes: item.sourceBytes, projectType: PYTHON_PROJECT_TYPE })),
      files: projects.filter((item) => item.projectType === PYTHON_PROJECT_TYPE).flatMap((item) => {
        const snapshot = snapshots.find(([revisionId]) => revisionId === item.revisionId)?.[1];
        return (snapshot?.files ?? []).map((file) => ({ projectId: item.id, name: basename(file.path), path: file.path, projectType: PYTHON_PROJECT_TYPE }));
      }),
      runs: copy(seed.runs ?? []),
      distributions: copy(seed.distributions ?? []),
      classes: copy(seed.classes ?? []),
      enrollments: copy(seed.enrollments ?? [])
    };
    this.#ready = Promise.all(snapshots.map(([revisionId, snapshot]) => this.#sources.write(revisionId, snapshot)));
  }

  async transaction(operation) {
    await this.#ready;
    const snapshot = copy(this.#data);
    const sequence = this.#sequence;
    try {
      return await operation(this);
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

  #syncFiles(projectId, files) {
    this.#data.files = this.#data.files.filter((item) => item.projectId !== projectId || item.projectType !== PYTHON_PROJECT_TYPE);
    this.#data.files.push(...files.map((file) => ({ projectId, name: basename(file.path), path: file.path, projectType: PYTHON_PROJECT_TYPE })));
  }

  async #hydrate(project) {
    const snapshot = await this.#sources.read(project.revisionId);
    const entry = snapshot.files.find((file) => file.path === snapshot.entrypoint);
    return { ...copy(project), ...snapshot, source: entry?.content ?? '' };
  }

  async listWorkspace(ownerId, parentId = null) {
    await this.#ready;
    this.#assertParent(ownerId, parentId);
    return {
      groups: copy(this.#data.groups.filter((item) => item.ownerId === ownerId && item.parentId === parentId && item.projectType === PYTHON_PROJECT_TYPE)),
      projects: copy(this.#data.projects.filter((item) => item.ownerId === ownerId && item.parentId === parentId && item.projectType === PYTHON_PROJECT_TYPE).map(metadata))
    };
  }

  async listAllGroups(ownerId) {
    await this.#ready;
    return copy(this.#data.groups.filter((item) => item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE));
  }

  async createGroup({ ownerId, name, parentId = null }) {
    await this.#ready;
    this.#assertParent(ownerId, parentId);
    const group = { id: this.#nextId('group'), ownerId, name, parentId, position: Date.now(), projectType: PYTHON_PROJECT_TYPE };
    this.#data.groups.push(group);
    return copy(group);
  }

  async createProject({ ownerId, name, parentId = null, snapshot, source = '', stdin = '', revisionId = randomUUID() }) {
    await this.#ready;
    this.#assertParent(ownerId, parentId);
    const content = validateSnapshot(snapshot ?? { source, stdin });
    await this.#sources.write(revisionId, content);
    const project = { id: this.#nextId('project'), ownerId, name, parentId, position: Date.now(), projectType: PYTHON_PROJECT_TYPE, version: 1, revisionId, sourceBytes: Buffer.byteLength(JSON.stringify(content)) };
    this.#data.projects.push(project);
    this.#data.revisions.push({ id: revisionId, projectId: project.id, version: 1, sourceBytes: project.sourceBytes, projectType: PYTHON_PROJECT_TYPE });
    this.#syncFiles(project.id, content.files);
    return this.#hydrate(project);
  }

  async getProject(id) {
    await this.#ready;
    const project = this.#data.projects.find((item) => item.id === id && item.projectType === PYTHON_PROJECT_TYPE);
    if (!project) throw notFound();
    return this.#hydrate(project);
  }

  async updateProjectSource({ id, ownerId, snapshot, source, stdin, version, revisionId = randomUUID() }) {
    await this.#ready;
    const project = this.#data.projects.find((item) => item.id === id && item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE);
    if (!project) throw notFound();
    if (project.version !== version) throw new AppError(409, 'VERSION_CONFLICT', 'The project has changed on the server.');
    const content = validateSnapshot(snapshot ?? { source, stdin });
    const current = await this.#sources.read(project.revisionId);
    if (JSON.stringify(current) === JSON.stringify(content)) return this.#hydrate(project);
    await this.#sources.write(revisionId, content);
    project.revisionId = revisionId;
    project.sourceBytes = Buffer.byteLength(JSON.stringify(content));
    project.version += 1;
    this.#data.revisions.push({ id: revisionId, projectId: project.id, version: project.version, sourceBytes: project.sourceBytes, projectType: PYTHON_PROJECT_TYPE });
    this.#syncFiles(project.id, content.files);
    return this.#hydrate(project);
  }

  async rename({ kind, id, ownerId, name }) {
    await this.#ready;
    const records = kind === 'project' ? this.#data.projects : kind === 'group' ? this.#data.groups : null;
    if (!records) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be renamed.');
    const item = records.find((record) => record.id === id && record.ownerId === ownerId && record.projectType === PYTHON_PROJECT_TYPE);
    if (!item) throw notFound();
    item.name = name;
    return kind === 'project' ? this.#hydrate(item) : copy(item);
  }

  async delete({ kind, id, ownerId }) {
    await this.#ready;
    const records = kind === 'project' ? this.#data.projects : kind === 'group' ? this.#data.groups : null;
    if (!records) throw new AppError(400, 'INVALID_KIND', 'Only projects and groups may be deleted.');
    const index = records.findIndex((item) => item.id === id && item.ownerId === ownerId && item.projectType === PYTHON_PROJECT_TYPE);
    if (index < 0) throw notFound();
    if (kind === 'group' && (this.#data.groups.some((item) => item.parentId === id && item.projectType === PYTHON_PROJECT_TYPE) || this.#data.projects.some((item) => item.parentId === id && item.projectType === PYTHON_PROJECT_TYPE))) {
      throw new AppError(409, 'GROUP_NOT_EMPTY', 'A non-empty group cannot be deleted.');
    }
    if (kind === 'group') {
      records.splice(index, 1);
      return { revisionIds: [] };
    }
    const revisionIds = this.#data.revisions.filter((item) => item.projectId === id && item.projectType === PYTHON_PROJECT_TYPE).map((item) => item.id);
    records.splice(index, 1);
    this.#data.revisions = this.#data.revisions.filter((item) => item.projectId !== id || item.projectType !== PYTHON_PROJECT_TYPE);
    this.#data.runs = this.#data.runs.filter((item) => item.projectId !== id || item.projectType !== PYTHON_PROJECT_TYPE);
    this.#data.files = this.#data.files.filter((item) => item.projectId !== id || item.projectType !== PYTHON_PROJECT_TYPE);
    this.#data.distributions = this.#data.distributions.filter((item) => item.projectType !== PYTHON_PROJECT_TYPE || (item.projectId !== id && item.distributedProjectId !== id));
    return { revisionIds };
  }

  async removeSnapshots(revisionIds) {
    const results = await Promise.all(revisionIds.map((revisionId) => this.#sources.removeEventually(revisionId)));
    return results.every(Boolean);
  }

  async move({ kind, id, ownerId, parentId }) {
    await this.#ready;
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
    return kind === 'project' ? this.#hydrate(item) : copy(item);
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
    await this.#ready;
    const existing = requestId ? this.#data.runs.find((item) => item.ownerId === ownerId && item.requestId === requestId && item.projectType === PYTHON_PROJECT_TYPE) : null;
    if (existing) return copy(existing);
    const run = {
      id: this.#nextId('run'),
      projectId: project.id,
      ownerId,
      requestId,
      version: project.version,
      revisionId: project.revisionId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      projectType: PYTHON_PROJECT_TYPE
    };
    this.#data.runs.push(run);
    const retained = new Set([run.id, ...this.#data.runs.filter((item) => item.projectId === project.id && item.projectType === PYTHON_PROJECT_TYPE && item.id !== run.id).slice(-19).map((item) => item.id)]);
    this.#data.runs = this.#data.runs.filter((item) => item.projectId !== project.id || item.projectType !== PYTHON_PROJECT_TYPE || retained.has(item.id));
    return copy(run);
  }

  async getRun(id) {
    await this.#ready;
    const run = this.#data.runs.find((item) => item.id === id && item.projectType === PYTHON_PROJECT_TYPE);
    if (!run) throw notFound();
    return copy(run);
  }

  async getRevisionSnapshot(revisionId) {
    await this.#ready;
    return this.#sources.read(revisionId);
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
    await this.#ready;
    return copy(this.#data.runs.filter((item) => item.projectId === projectId && item.projectType === PYTHON_PROJECT_TYPE).slice(-20).reverse());
  }

  async distributeProject({ project, teacherId, classId, requestId }) {
    await this.#ready;
    const classroom = this.#data.classes.find((item) => item.id === classId && item.teacherId === teacherId);
    if (!classroom) throw notFound();
    const existing = this.#data.distributions.filter((item) => item.projectId === project.id && item.classId === classId && item.requestId === requestId && item.projectType === PYTHON_PROJECT_TYPE);
    if (existing.length) return Promise.all(existing.map((item) => this.getProject(item.distributedProjectId)));
    const recipients = this.#data.enrollments.filter((item) => item.classId === classId);
    const snapshot = validateSnapshot(project);
    const copies = [];
    for (const recipient of recipients) {
      const copied = await this.createProject({ ownerId: recipient.studentId, name: project.name, snapshot });
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
