import { ApiError } from './api.mjs';

const allowedKinds = new Set(['project', 'group']);

function projectSummary(project) {
  return {
    kind: 'project',
    id: String(project.id),
    name: project.name,
    parentId: project.parent_id ?? project.parentId ?? null,
    sortOrder: project.sort_order ?? project.position ?? 0,
    updatedAt: project.updated_at ?? project.updatedAt ?? null
  };
}

function groupSummary(group) {
  const id = Number(group.id);
  if (!Number.isInteger(id)) throw new ApiError({ status: 500, code: 'INVALID_GROUP_ID', message: 'The server returned an invalid Python group id.' });
  return {
    kind: 'group',
    id,
    name: group.name,
    parentId: group.parent_id ?? group.parentId ?? null,
    sortOrder: group.sort_order ?? group.position ?? 0,
    updatedAt: group.updated_at ?? group.updatedAt ?? null
  };
}

function breadcrumbs(groups, parentId) {
  const result = [];
  let current = parentId;
  while (current !== null && current !== undefined) {
    const group = groups.find((item) => item.id === current);
    if (!group) break;
    result.unshift(group);
    current = group.parentId;
  }
  return result;
}

export function createProjectOrganizerAdapter({ api, navigate, onInvalidParent }) {
  let latestLoad = 0;

  async function allGroups(ownerId) {
    const query = ownerId === null || ownerId === undefined ? '' : `?studentId=${encodeURIComponent(ownerId)}`;
    const response = await api(`/workspace/groups${query}`);
    return response.groups.map(groupSummary);
  }

  function assertKind(kind) {
    if (!allowedKinds.has(kind)) throw new ApiError({ status: 400, code: 'INVALID_KIND', message: 'Only projects and groups are supported.' });
  }

  return {
    async loadDirectory({ ownerId, parentId = null }) {
      const requestNumber = ++latestLoad;
      const query = new URLSearchParams();
      if (ownerId !== null && ownerId !== undefined) query.set('studentId', ownerId);
      if (parentId !== null && parentId !== undefined) query.set('parentId', parentId);
      let activeParentId = parentId;
      let directory;
      let groups;
      try {
        [directory, groups] = await Promise.all([api(`/workspace?${query}`), allGroups(ownerId)]);
      } catch (error) {
        if (activeParentId === null || activeParentId === undefined || !(error instanceof ApiError) || error.code !== 'NOT_FOUND') throw error;
        query.delete('parentId');
        [directory, groups] = await Promise.all([api(`/workspace?${query}`), allGroups(ownerId)]);
        activeParentId = null;
      }
      if (requestNumber !== latestLoad) throw new ApiError({ status: 409, code: 'STALE_RESPONSE', message: 'A newer directory request is already active.' });
      if (activeParentId !== parentId) onInvalidParent?.();
      return {
        projects: directory.projects.map(projectSummary),
        groups: directory.groups.map(groupSummary),
        breadcrumbs: breadcrumbs(groups, activeParentId),
        owner: directory.owner ?? null,
        readOnly: Boolean(directory.readOnly)
      };
    },
    loadAllGroups({ ownerId }) {
      return allGroups(ownerId);
    },
    async createProject({ name, parentId = null, templateId }) {
      return projectSummary(await api('/projects', { method: 'POST', body: { name, parentId, templateId } }));
    },
    async createGroup({ name, parentId = null }) {
      return groupSummary(await api('/groups', { method: 'POST', body: { name, parentId } }));
    },
    async renameItem({ kind, id, name }) {
      assertKind(kind);
      const response = await api(`/${kind === 'project' ? 'projects' : 'groups'}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name } });
      return kind === 'project' ? projectSummary(response) : groupSummary(response);
    },
    async repositionItem({ kind, id, parentId, beforeId }) {
      assertKind(kind);
      const response = await api(`/${kind === 'project' ? 'projects' : 'groups'}/${encodeURIComponent(id)}/reposition`, { method: 'PUT', body: { parentId, beforeId } });
      return { repositioned: true, item: kind === 'project' ? projectSummary(response) : groupSummary(response) };
    },
    async deleteItem({ kind, id }) {
      assertKind(kind);
      await api(`/${kind === 'project' ? 'projects' : 'groups'}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { deleted: true };
    },
    openProject(id) {
      return navigate(id);
    }
  };
}
