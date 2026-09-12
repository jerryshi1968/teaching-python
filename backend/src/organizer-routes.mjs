import { AppError } from './errors.mjs';

function match(path, expression) {
  return path.match(expression);
}

export async function routeOrganizerRequest(service, request) {
  const { actor, method, path, body = {}, query = {} } = request;
  if (method === 'GET' && path === '/api/python/workspace/groups') {
    return { status: 200, body: await service.allGroups(actor, query.studentId ?? actor.id) };
  }
  for (const kind of ['project', 'group']) {
    const collection = kind === 'project' ? 'projects' : 'groups';
    const item = match(path, new RegExp(`^/api/python/${collection}/([^/]+)$`));
    const id = kind === 'group' && item ? Number(item[1]) : item?.[1];
    if (item && method === 'PATCH') return { status: 200, body: await service.rename(actor, kind, id, body.name) };
    if (item && method === 'DELETE') {
      await service.delete(actor, kind, id);
      return { status: 200, body: { deleted: true } };
    }
    const reposition = match(path, new RegExp(`^/api/python/${collection}/([^/]+)/reposition$`));
    if (reposition && method === 'PUT') return { status: 200, body: await service.move(actor, kind, kind === 'group' ? Number(reposition[1]) : reposition[1], body.parentId ?? null) };
  }
  return null;
}

export function requireActor(actor) {
  if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in is required.');
}
