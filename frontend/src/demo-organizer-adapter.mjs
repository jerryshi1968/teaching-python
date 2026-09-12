const now = () => new Date().toISOString();

export function createDemoOrganizerAdapter(openProject, { readOnly = false } = {}) {
  const groups = [{ kind: 'group', id: 1, name: '第一课：认识 Python', parentId: null, sortOrder: 0, updatedAt: now() }];
  const projects = [
    { kind: 'project', id: 'python-hello', name: 'Hello, Python', parentId: null, sortOrder: 0, updatedAt: now() },
    { kind: 'project', id: 'python-variable', name: '变量与基本运算', parentId: null, sortOrder: 1, updatedAt: now() },
    { kind: 'project', id: 'python-condition', name: '条件判断', parentId: null, sortOrder: 2, updatedAt: now() }
  ];
  let serial = 3;
  const items = (parentId) => ({ groups: groups.filter((item) => item.parentId === parentId), projects: projects.filter((item) => item.parentId === parentId) });
  const find = (kind, id) => (kind === 'group' ? groups : projects).find((item) => item.id === id);
  return {
    async loadDirectory({ parentId = null } = {}) {
      const directory = items(parentId);
      const breadcrumbs = [];
      let current = parentId;
      while (current !== null) {
        const group = find('group', current);
        if (!group) break;
        breadcrumbs.unshift(group);
        current = group.parentId;
      }
      return { ...directory, breadcrumbs, owner: { id: 1, username: '我' }, readOnly };
    },
    async loadAllGroups() { return [...groups]; },
    async createProject({ name, parentId = null }) {
      const project = { kind: 'project', id: `python-demo-${serial++}`, name, parentId, sortOrder: projects.length, updatedAt: now() };
      projects.push(project);
      return project;
    },
    async createGroup({ name, parentId = null }) {
      const group = { kind: 'group', id: serial++, name, parentId, sortOrder: groups.length, updatedAt: now() };
      groups.push(group);
      return group;
    },
    async renameItem({ kind, id, name }) { const item = find(kind, id); item.name = name; item.updatedAt = now(); return item; },
    async repositionItem({ kind, id, parentId }) { const item = find(kind, id); item.parentId = parentId; item.updatedAt = now(); return { repositioned: true, item }; },
    async deleteItem({ kind, id }) { const collection = kind === 'group' ? groups : projects; const index = collection.findIndex((item) => item.id === id); if (index >= 0) collection.splice(index, 1); return { deleted: true }; },
    openProject
  };
}
