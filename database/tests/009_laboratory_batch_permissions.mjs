// Real PostgreSQL in CI; optional embedded PostgreSQL for isolated local reproduction.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
let db;
const embedded = process.env.PORTUS_TEST_PGLITE_MODULE;
if (embedded) {
  const { PGlite } = await import(embedded);
  db = new PGlite();
  for (const name of (await readdir(new URL('database/migrations/', root))).filter(n => n.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(`database/migrations/${name}`, root), 'utf8'));
  }
} else {
  const { Client } = await import('pg');
  db = new Client();
  await db.connect();
  db.exec = sql => db.query(sql);
}
try {
  if (embedded) {
    const repair = await readFile(new URL('database/migrations/023_laboratory_batch_permissions.sql', root), 'utf8');
    await db.exec(repair);
    await db.exec(repair);
  }
  await db.exec('BEGIN');
  await db.exec('CREATE ROLE portus_lab_permissions_qa NOLOGIN NOSUPERUSER');
  const installer = await readFile(new URL('database/install-portus-database.ps1', root), 'utf8');
  await db.exec(installer.match(/\$grantSql = @'([\s\S]*?)'@/)[1].replaceAll(':"app_user"', 'portus_lab_permissions_qa'));
  const id = async (sql, params = []) => (await db.query(sql, params)).rows[0].id;
  const app = await id("INSERT INTO applications(code,name) VALUES('LAB-PERMISSIONS-QA','QA') RETURNING id");
  for (const sector of ['PRODUCTION', 'LABORATORY']) {
    await db.query('INSERT INTO sectors(code,name) VALUES($1,$1) ON CONFLICT(code) DO NOTHING', [sector]);
  }
  const sectors = Object.fromEntries((await db.query('SELECT code,id FROM sectors')).rows.map(r => [r.code, r.id]));
  await db.query('INSERT INTO application_sector_permissions(application_id,sector_id,can_read) SELECT $1,id,TRUE FROM sectors', [app]);
  const product = await id("INSERT INTO products(name) VALUES('LAB-PERMISSIONS-QA') RETURNING id");
  let sequence = 0;
  for (const [role, credential, sector, complete, revoke, finalize] of [
    ['laboratory', 'LABORATORY', 'LABORATORY', true, true, true],
    ['operator', 'LABORATORY', 'LABORATORY', true, true, true],
    ['operator', 'PRODUCTION', 'PRODUCTION', true, false, false],
    ['supervisor', 'PRODUCTION', 'PRODUCTION', true, true, true],
    ['master', 'ADMIN', 'PRODUCTION', true, true, true],
    ['admin', 'PRODUCTION', 'PRODUCTION', false, false, false],
    ['laboratory', 'LABORATORY', 'PRODUCTION', false, false, false],
    ['operator', 'PRODUCTION', 'LABORATORY', false, false, false]
  ]) {
    const name = `${role}/${credential}/${sector}`;
    const user = await id('INSERT INTO users(username,password_hash,role,sector_code) VALUES($1,\'qa-only\',$2,$3) RETURNING id', [`lab_permissions_qa_${sequence++}`, role, credential]);
    await db.query('INSERT INTO user_sector_permissions(user_id,sector_id,can_read) SELECT $1,id,TRUE FROM sectors', [user]);
    const batch = await id('INSERT INTO batches(product_id,code,created_by) VALUES($1,$2,$3) RETURNING id', [product, `LAB-PERMISSIONS-QA-${sequence}`, user]);
    const args = [batch, user, app, sectors[sector]];
    const operation = async (sql, params, allowed, deniedCode = '42501') => {
      await db.exec('SAVEPOINT operation');
      try {
        const result = await db.query(sql, params);
        assert.ok(allowed, `${name}: unauthorized operation succeeded`);
        await db.exec('RELEASE SAVEPOINT operation');
        return result.rows[0];
      } catch (error) {
        await db.exec('ROLLBACK TO SAVEPOINT operation');
        if (allowed) throw new Error(`${name}: ${error.message}`);
        assert.equal(error.code, deniedCode, name);
      }
    };
    if (role === 'laboratory' && sector === 'LABORATORY') {
      await db.query('UPDATE user_sector_permissions SET can_read=FALSE WHERE user_id=$1', [user]);
      await db.exec('SET LOCAL ROLE portus_lab_permissions_qa');
      await operation('SELECT * FROM set_batch_completed($1,$2,$3,$4,TRUE)', args, false);
      await db.exec('RESET ROLE');
      await db.query('UPDATE user_sector_permissions SET can_read=TRUE WHERE user_id=$1', [user]);
      await db.query('UPDATE users SET active=FALSE WHERE id=$1', [user]);
      await db.exec('SET LOCAL ROLE portus_lab_permissions_qa');
      await operation('SELECT * FROM supervisor_finalize_batch($1,$2,$3,$4)', args, false);
      await db.exec('RESET ROLE');
      await db.query('UPDATE users SET active=TRUE WHERE id=$1', [user]);
    }
    await db.exec('SET LOCAL ROLE portus_lab_permissions_qa');
    await operation('SELECT * FROM set_batch_completed($1,$2,$3,$4,TRUE)', args, complete);
    await db.exec('RESET ROLE');
    // Also test revocation/finalization when completion was performed by another actor.
    if (!complete) await db.query('UPDATE batches SET completed=TRUE,completed_by=$2,completed_at=now() WHERE id=$1', [batch,user]);
    await db.exec('SET LOCAL ROLE portus_lab_permissions_qa');
    const undone = await operation('SELECT * FROM set_batch_completed($1,$2,$3,$4,FALSE)', args, revoke);
    if (revoke) {
      assert.equal(undone.completed, false);
      assert.equal(undone.completed_by, null);
      await db.exec('SAVEPOINT prerequisite');
      await assert.rejects(db.query('SELECT * FROM supervisor_finalize_batch($1,$2,$3,$4)', args), e => e.code === '55000');
      // Recover the transaction after the prerequisite rejection.
      await db.exec('ROLLBACK TO SAVEPOINT prerequisite');
    }
    await db.exec('RESET ROLE');
    await db.query('UPDATE batches SET completed=TRUE,completed_by=$2,completed_at=now() WHERE id=$1', [batch,user]);
    await db.exec('SET LOCAL ROLE portus_lab_permissions_qa');
    const closed = await operation('SELECT * FROM supervisor_finalize_batch($1,$2,$3,$4)', args, finalize);
    if (finalize) {
      assert.equal(closed.status, 'closed');
      assert.equal(String(closed.closed_by), String(user));
      await operation('SELECT * FROM supervisor_finalize_batch($1,$2,$3,$4)', args, true);
      await operation('SELECT * FROM set_batch_completed($1,$2,$3,$4,FALSE)', args, false, revoke ? '55000' : '42501');
      if (role === 'laboratory') {
        await operation("SELECT * FROM master_reopen_batch($1,$2,$3,$4,'Reabertura de teste')", args, false);
      }
    }
    await db.exec('RESET ROLE');
    if (finalize) assert.equal(Number((await db.query("SELECT count(*) AS n FROM batch_history WHERE batch_id=$1 AND action='BATCH_FINALIZED'", [batch])).rows[0].n), 1);
    console.log(`PASS ${name}: complete=${complete}, revoke=${revoke}, finalize=${finalize}`);
  }
  await db.exec('ROLLBACK');
} finally {
  if (embedded) await db.close(); else await db.end();
}
