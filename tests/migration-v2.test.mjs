import assert from 'node:assert/strict';
import test from 'node:test';
import { migrationPlan } from '../backend/src/migrate.mjs';

test('migration plan includes distributions before shared projects and the multi-file reset', async () => {
  const plan = await migrationPlan();
  assert.deepEqual(plan.map((item) => item.id), ['001_python', '002_python_distributions', '003_python_shared_projects', '004_python_multifile']);
});

test('multi-file migration clears only Python projects and removes code columns', async () => {
  const migration = (await migrationPlan()).find((item) => item.id === '004_python_multifile');
  assert.match(migration.sql, /DELETE f FROM files f JOIN projects p ON p\.id = f\.project_id WHERE p\.project_type = 'python'/);
  assert.match(migration.sql, /DELETE FROM projects WHERE project_type = 'python'/);
  const documentDefinition = migration.sql.match(/CREATE TABLE python_documents \(([\s\S]*?)\) ENGINE=/)?.[1] ?? '';
  const runDefinition = migration.sql.match(/CREATE TABLE python_runs \(([\s\S]*?)\) ENGINE=/)?.[1] ?? '';
  assert.doesNotMatch(documentDefinition, /\bsource\b|\bstdin\b/);
  assert.doesNotMatch(runDefinition, /\bsource\b|\bstdin\b/);
  assert.match(documentDefinition, /revision_id/);
  assert.match(runDefinition, /revision_id/);
});
