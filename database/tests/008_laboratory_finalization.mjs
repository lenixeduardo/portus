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
  await db.exec(await readFile(new URL('database/tests/008_laboratory_finalization.sql', root), 'utf8'));
  const { rows: [actor] } = await db.query("INSERT INTO users(username,password_hash,role) VALUES('audit_qa','test-only','operator') RETURNING id");
  // Execute the actual handler query so a missing parameter cast is caught by PostgreSQL.
  const handler = await readFile(new URL('src/main/ipc/central-handlers.ts', root), 'utf8');
  const sql = handler.match(/async function auditAdministrativeReason[\s\S]*?`([\s\S]*?)`/)[1];
  await db.query(sql, [actor.id, 'LAB-QA', 'BATCH_FINALIZED', '1', 'Análises aprovadas']);
  const { rows: [audit] } = await db.query("SELECT details, station_code FROM portus_audit_log WHERE action='BATCH_FINALIZED'");
  assert.equal(audit.details.justification, 'Análises aprovadas');
  assert.equal(audit.station_code, 'LAB-QA');
  console.log('PASS: all migrations; laboratory finalization; prerequisite; idempotent retry; audit justification and station');
} finally { await db.close(); }
