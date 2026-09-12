import { AppError } from './errors.mjs';
import { routeOrganizerRequest } from './organizer-routes.mjs';

export function createPythonApp(service) {
  return async function handle(request) {
    try {
      const { actor, method, path, body = {}, query = {} } = request;
      if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in is required.');
      if (method === 'GET' && path === '/api/python/workspace') return { status: 200, body: await service.workspace(actor, query.studentId ?? actor.id, query.parentId ?? null) };
      if (method === 'POST' && path === '/api/python/projects') return { status: 201, body: await service.createProject(actor, body) };
      if (method === 'POST' && path === '/api/python/groups') return { status: 201, body: await service.createGroup(actor, body) };
      if (method === 'GET' && path === '/api/python/classes') return { status: 200, body: await service.classes(actor) };
      const classStudentsMatch = path.match(/^\/api\/python\/classes\/([^/]+)\/students$/);
      if (method === 'GET' && classStudentsMatch) return { status: 200, body: await service.students(actor, classStudentsMatch[1]) };
      const organizerResponse = await routeOrganizerRequest(service, request);
      if (organizerResponse) return organizerResponse;
      const projectMatch = path.match(/^\/api\/python\/projects\/([^/]+)$/);
      if (method === 'GET' && projectMatch) return { status: 200, body: await service.project(actor, projectMatch[1]) };
      const copyMatch = path.match(/^\/api\/python\/projects\/([^/]+)\/copy$/);
      if (method === 'POST' && copyMatch) return { status: 201, body: await service.copyToMine(actor, copyMatch[1]) };
      const distributeMatch = path.match(/^\/api\/python\/projects\/([^/]+)\/distribute$/);
      if (method === 'POST' && distributeMatch) return { status: 201, body: await service.distributeProject(actor, distributeMatch[1], body) };
      const sourceMatch = path.match(/^\/api\/python\/projects\/([^/]+)\/source$/);
      if (method === 'PUT' && sourceMatch) return { status: 200, body: await service.saveSource(actor, sourceMatch[1], body) };
      const projectRunMatch = path.match(/^\/api\/python\/projects\/([^/]+)\/run$/);
      if (method === 'POST' && projectRunMatch) return { status: 202, body: await service.runProject(actor, projectRunMatch[1], body) };
      const projectRunsMatch = path.match(/^\/api\/python\/projects\/([^/]+)\/runs$/);
      if (method === 'GET' && projectRunsMatch) return { status: 200, body: await service.runs(actor, projectRunsMatch[1]) };
      const runMatch = path.match(/^\/api\/python\/runs\/([^/]+)$/);
      if (method === 'GET' && runMatch) return { status: 200, body: await service.run(actor, runMatch[1]) };
      const runSourceMatch = path.match(/^\/api\/python\/runs\/([^/]+)\/source$/);
      if (method === 'GET' && runSourceMatch) return { status: 200, body: await service.runSource(actor, runSourceMatch[1]) };
      const stopRunMatch = path.match(/^\/api\/python\/runs\/([^/]+)\/stop$/);
      if (method === 'POST' && stopRunMatch) return { status: 202, body: await service.stopRun(actor, stopRunMatch[1]) };
      throw new AppError(404, 'NOT_FOUND', 'The requested Python endpoint was not found.');
    } catch (error) {
      if (error instanceof AppError) return { status: error.status, body: { code: error.code, message: error.message } };
      throw error;
    }
  };
}
