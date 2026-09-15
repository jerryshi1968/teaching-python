import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createConnection } from 'mysql2/promise';
import { readConfig } from './config.mjs';

const migrations = [
  { id: '001_python', file: '001_python.sql' },
  { id: '002_python_distributions', file: '002_python_distributions.sql' },
  { id: '003_python_shared_projects', file: '003_python_shared_projects.sql' },
  { id: '004_python_multifile', file: '004_python_multifile.sql' }
];

async function readMigration(migration) {
  return { ...migration, sql: await readFile(new URL(`../migrations/${migration.file}`, import.meta.url), 'utf8') };
}

export async function migrationPlan() {
  return Promise.all(migrations.map(readMigration));
}

function statementsFor(sql) {
  return sql.replace(/^--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean);
}

async function markApplying(connection, id, checksum) {
  await connection.execute('INSERT INTO python_schema_migrations(id,checksum,state,completed_statements) VALUES(?,?,\'applying\',0)', [id, checksum]);
}

async function runStatements(connection, migration, statements, skipIndex = -1) {
  let completed = 0;
  try {
    for (let index = 0; index < statements.length; index++) {
      if (index === skipIndex) continue;
      await connection.query(statements[index]);
      completed++;
      await connection.execute('UPDATE python_schema_migrations SET completed_statements=? WHERE id=?', [completed, migration.id]);
    }
    await connection.execute('UPDATE python_schema_migrations SET state=\'complete\' WHERE id=?', [migration.id]);
    return { id: migration.id, applied: true, statements: completed };
  } catch (error) {
    throw new Error(`Migration ${migration.id} stopped after ${completed}/${statements.length - (skipIndex >= 0 ? 1 : 0)} statements: ${error.message}`, { cause: error });
  }
}

async function bootstrapBaseMigration(connection, migration) {
  const checksum = createHash('sha256').update(migration.sql).digest('hex');
  const statements = statementsFor(migration.sql);
  const markerIndex = statements.findIndex(statement => statement.startsWith('CREATE TABLE python_schema_migrations'));
  if (markerIndex < 0) throw new Error('Base Python migration must create python_schema_migrations.');
  await connection.query(statements[markerIndex]);
  await markApplying(connection, migration.id, checksum);
  return runStatements(connection, migration, statements, markerIndex);
}

async function applySingleMigration(connection, migration) {
  const checksum = createHash('sha256').update(migration.sql).digest('hex');
  const [rows] = await connection.execute('SELECT state,checksum FROM python_schema_migrations WHERE id=?', [migration.id]);
  if (rows[0]?.state === 'complete' && rows[0]?.checksum === checksum) return { id: migration.id, applied: false, message: 'Migration already completed.' };
  if (rows.length) throw new Error(`Found an incomplete or changed migration: ${migration.id}`);
  await markApplying(connection, migration.id, checksum);
  return runStatements(connection, migration, statementsFor(migration.sql));
}

export async function applyMigration(connection, plan = null) {
  const resolvedPlan = plan ?? await migrationPlan();
  const [version] = await connection.query('SELECT VERSION() AS version');
  if (!/^8\./.test(version[0].version)) throw new Error('Python migration requires MySQL 8.x.');
  const [tables] = await connection.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const names = new Set(tables.map(row => row.name));
  for (const required of ['users', 'classes', 'projects', 'project_groups']) if (!names.has(required)) throw new Error(`Missing shared table: ${required}`);
  const results = [];
  if (!names.has('python_schema_migrations')) results.push(await bootstrapBaseMigration(connection, resolvedPlan[0]));
  else results.push(await applySingleMigration(connection, resolvedPlan[0]));
  for (const migration of resolvedPlan.slice(1)) results.push(await applySingleMigration(connection, migration));
  return results;
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const plan = await migrationPlan();
  if (!process.argv.includes('--apply')) { console.log('Migration plan only; no database connection or change was made.\n'); for (const migration of plan) console.log(`-- ${migration.id}\n${migration.sql}`); }
  else { const config = readConfig(); const confirmation = process.argv[process.argv.indexOf('--confirm-db') + 1]; if (config.mode !== 'production' || confirmation !== config.db.database || !process.argv.includes('--data-reviewed') || !process.argv.includes('--production-reviewed')) throw new Error('Production migration requires --confirm-db, --data-reviewed, and --production-reviewed.'); const connection = await createConnection(config.db); try { console.log(await applyMigration(connection, plan)); } finally { await connection.end(); } }
}
