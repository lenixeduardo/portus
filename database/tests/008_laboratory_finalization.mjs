// Uses an in-memory PostgreSQL engine; never connects to the production database.
// Install @electric-sql/pglite in a separate test prefix and provide its module path
// via PORTUS_TEST_PGLITE_MODULE, or make it available in node_modules.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PORTUS_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const root = new URL('../../', import.meta.url);
const db = new PGlite();
try {
  for (const name of (await readdir(new URL('database/migrations/', root))).filter(n => n.endsWith('.sql')).sort()) {
    try { await db.exec(await readFile(new URL(`database/migrations/${name}`, root), 'utf8')); }
    catch (error) { throw new Error(`${name}: ${error.message}`); }
  }
  const installer = await readFile(new URL('database/install-portus-database.ps1', root), 'utf8');
  const grants = installer.match(/\$grantSql = @'([\s\S]*?)'@/)[1].replaceAll(':"app_user"', 'portus_runtime_qa');
  await db.exec('CREATE ROLE portus_runtime_qa NOLOGIN NOSUPERUSER;');
  await db.exec(grants);
  await db.exec(await readFile(new URL('database/tests/008_laboratory_finalization.sql', root), 'utf8'));
  const { rows: [actor] } = await db.query("INSERT INTO users(username,password_hash,role) VALUES('audit_qa','test-only','operator') RETURNING id");
  // Execute the actual handler query so a missing parameter cast is caught by PostgreSQL.
  const handler = await readFile(new URL('src/main/ipc/central-handlers.ts', root), 'utf8');
  const sql = handler.match(/async function auditAdministrativeReason[\s\S]*?`([\s\S]*?)`/)[1];
  await db.exec('SET ROLE portus_runtime_qa');
  await db.query(sql, [actor.id, 'LAB-QA', 'BATCH_FINALIZED', '1', 'Análises aprovadas']);
  const { rows: [audit] } = await db.query("SELECT details, station_code FROM portus_audit_log WHERE action='BATCH_FINALIZED'");
  assert.equal(audit.details.justification, 'Análises aprovadas');
  assert.equal(audit.station_code, 'LAB-QA');
  await assert.rejects(db.exec("UPDATE batches SET status='closed'"), /permission denied/);
  await db.exec('RESET ROLE');
  await db.exec('REVOKE INSERT ON portus_audit_log FROM portus_runtime_qa');
  const repair = await readFile(new URL('database/migrations/020_runtime_finalization_audit.sql', root), 'utf8');
  await db.exec(repair);
  await db.exec(repair);
  await db.exec('SET ROLE portus_runtime_qa');
  await db.query(sql, [actor.id, 'LAB-QA-UPGRADE', 'BATCH_FINALIZED', '2', 'Análises aprovadas']);
  await assert.rejects(db.exec("UPDATE batches SET status='closed'"), /permission denied/);
  console.log('PASS: all migrations; laboratory finalization; prerequisite; idempotent retry; runtime audit on new and upgraded installations; direct batch updates remain denied');
} catch (error) {
  console.error(`${error.code || 'ERROR'}: ${error.message}`);
  process.exitCode = 1;
} finally { await db.close(); }
