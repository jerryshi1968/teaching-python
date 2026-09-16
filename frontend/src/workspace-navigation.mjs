export function readWorkspaceNavigation(search = '') {
  const parameters = new URLSearchParams(search);
  const rawFolderId = parameters.get('folderId');
  const folderId = rawFolderId === null ? null : Number(rawFolderId);
  return {
    classId: parameters.get('classId') || null,
    studentId: parameters.get('studentId') || 'me',
    folderId: Number.isSafeInteger(folderId) && folderId > 0 ? folderId : null
  };
}

export function writeWorkspaceNavigation(search = '', { classId, studentId, folderId }) {
  const parameters = new URLSearchParams(search);
  if (classId) parameters.set('classId', classId);
  else parameters.delete('classId');
  if (studentId && studentId !== 'me') parameters.set('studentId', studentId);
  else parameters.delete('studentId');
  if (folderId !== null && folderId !== undefined) parameters.set('folderId', String(folderId));
  else parameters.delete('folderId');
  const value = parameters.toString();
  return value ? `?${value}` : '';
}
