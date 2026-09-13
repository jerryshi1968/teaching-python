import { AppError, forbidden, notFound } from './errors.mjs';
import { requireName, requireSource, requireStdin } from './validation.mjs';

export class PythonService {
  constructor(repository, runnerGateway = null) {
    this.repository = repository;
    this.runnerGateway = runnerGateway;
  }

  async #assertReadable(actor, ownerId) {
    if (actor.id === ownerId) return false;
    if (['teacher', 'admin'].includes(actor.role) && await this.repository.canTeacherView(actor.id, ownerId)) return true;
    throw notFound();
  }

  async classes(actor) {
    if (!['teacher', 'admin'].includes(actor.role)) throw forbidden();
    return { classes: await this.repository.listTeacherClasses(actor.id) };
  }

  async students(actor, classId) {
    if (!['teacher', 'admin'].includes(actor.role)) throw forbidden();
    return { students: await this.repository.listClassStudents(actor.id, classId) };
  }
  async workspace(actor, ownerId, parentId = null) {
    const readOnly = await this.#assertReadable(actor, ownerId);
    return { ...(await this.repository.listWorkspace(ownerId, parentId)), readOnly };
  }

  async allGroups(actor, ownerId) {
    const readOnly = await this.#assertReadable(actor, ownerId);
    return { groups: await this.repository.listAllGroups(ownerId), readOnly };
  }

  async project(actor, id) {
    const project = await this.repository.getProject(id);
    const readOnly = await this.#assertReadable(actor, project.ownerId);
    return { ...project, readOnly };
  }

  #assertRunner() {
    if (!this.runnerGateway) throw new AppError(503, 'RUNNER_UNAVAILABLE', 'The Python runner is unavailable.');
  }

  #runSummary(run) {
    const { source, stdin, ...summary } = run;
    return summary;
  }

  async #refreshRun(run) {
    if (!this.runnerGateway) return run;
    try {
      const { source, stdin, ...result } = await this.runnerGateway.get(run.id);
      return this.repository.transaction(() => this.repository.updateRunResult({ id: run.id, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }));
    } catch (error) {
      if (error instanceof AppError && error.code === 'RUNNER_UNAVAILABLE') return run;
      throw error;
    }
  }
  async #assertWritable(actor, ownerId) {
    if (await this.#assertReadable(actor, ownerId)) throw forbidden();
  }
  async createProject(actor, input) {
    return this.repository.transaction(() => this.repository.createProject({ ownerId: actor.id, name: requireName(input.name), parentId: input.parentId ?? null, source: requireSource(input.source ?? ''), stdin: requireStdin(input.stdin ?? '') }));
  }

  async createGroup(actor, input) {
    return this.repository.transaction(() => this.repository.createGroup({ ownerId: actor.id, name: requireName(input.name), parentId: input.parentId ?? null }));
  }

  async saveSource(actor, id, input) {
    return this.repository.transaction(() => this.repository.updateProjectSource({ id, ownerId: actor.id, source: requireSource(input.source), stdin: requireStdin(input.stdin), version: input.version }));
  }

  async distributeProject(actor, projectId, input) {
    if (actor.role !== 'teacher' || typeof input.requestId !== 'string' || !input.requestId) throw forbidden();
    const project = await this.repository.getProject(projectId);
    await this.#assertWritable(actor, project.ownerId);
    return { projects: await this.repository.transaction(() => this.repository.distributeProject({ project, teacherId: actor.id, classId: input.classId, requestId: input.requestId })) };
  }
  async runProject(actor, projectId, input = {}) {
    this.#assertRunner();
    const project = await this.repository.getProject(projectId);
    await this.#assertWritable(actor, project.ownerId);
    const run = await this.repository.transaction(() => this.repository.createRun({ project, ownerId: actor.id, requestId: input.requestId ?? null }));
    const runnerInput = { id: run.id, source: run.source, stdin: run.stdin ?? '' };
    await this.runnerGateway.submit(runnerInput);
    return this.#runSummary(run);
  }

  async runs(actor, projectId) {
    const project = await this.repository.getProject(projectId);
    await this.#assertReadable(actor, project.ownerId);
    return { runs: (await Promise.all((await this.repository.listRuns(projectId)).map((run) => this.#refreshRun(run)))).map((run) => this.#runSummary(run)) };
  }

  async run(actor, id) {
    this.#assertRunner();
    const run = await this.repository.getRun(id);
    await this.#assertReadable(actor, run.ownerId);
    return this.#runSummary(await this.#refreshRun(run));
  }

  async runSource(actor, id) {
    const run = await this.repository.getRun(id);
    await this.#assertReadable(actor, run.ownerId);
    return { source: run.source, stdin: run.stdin, version: run.version };
  }

  async stopRun(actor, id) {
    this.#assertRunner();
    const run = await this.repository.getRun(id);
    await this.#assertWritable(actor, run.ownerId);
    return this.runnerGateway.stop(id);
  }
  async rename(actor, kind, id, name) {
    return this.repository.transaction(() => this.repository.rename({ kind, id, ownerId: actor.id, name: requireName(name) }));
  }

  async delete(actor, kind, id) {
    return this.repository.transaction(() => this.repository.delete({ kind, id, ownerId: actor.id }));
  }

  async move(actor, kind, id, parentId) {
    return this.repository.transaction(() => this.repository.move({ kind, id, ownerId: actor.id, parentId }));
  }

  async copyToMine(actor, id) {
    const source = await this.repository.getProject(id);
    await this.#assertReadable(actor, source.ownerId);
    if (source.ownerId === actor.id) throw forbidden();
    return this.createProject(actor, { name: `${source.name} copy`, source: source.source, stdin: source.stdin });
  }
}
