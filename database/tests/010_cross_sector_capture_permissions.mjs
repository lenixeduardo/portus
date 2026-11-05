// Valida a reconciliação real com PostgreSQL, inclusive contas existentes
// antes da migration. Todos os fixtures são revertidos no final.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const db = new Client();
await db.connect();
try {
  await db.query("BEGIN");
  const sectors = Object.fromEntries((await db.query(
    "SELECT code, id FROM sectors WHERE code IN ('PRODUCTION', 'LABORATORY')"
  )).rows.map(row => [row.code, row.id]));
  const applications = Object.fromEntries((await db.query(
    "SELECT code, id FROM applications WHERE code IN ('PORTUS', 'PORTUS_LABORATORY')"
  )).rows.map(row => [row.code, row.id]));
  assert.ok(sectors.PRODUCTION && sectors.LABORATORY, "Setores ausentes no seed");
  assert.ok(applications.PORTUS && applications.PORTUS_LABORATORY, "Aplicações ausentes no seed");

  async function assertAccess(userId, sector, action, allowed) {
    const app = sector === "PRODUCTION" ? applications.PORTUS : applications.PORTUS_LABORATORY;
    await db.query("SAVEPOINT auth_check");
    try {
      await db.query(
        "SELECT portus_assert_permission($1,$2,$3,$4)",
        [userId, app, sectors[sector], action]
      );
      assert.equal(allowed, true, `Acesso inesperado: ${sector}/${action}`);
    } catch (error) {
      if (allowed) throw error;
      assert.equal(error.code, "42501", `Erro não autorizado esperado: ${sector}/${action}`);
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT auth_check");
      await db.query("RELEASE SAVEPOINT auth_check");
    }
  }

  async function fixture(role, originSector, authorized, suffix) {
    const result = await db.query(
      "INSERT INTO users (username, password_hash, role, sector_code) " +
      "VALUES ($1,'qa-only',$2,$3) RETURNING id",
      [`cross_sector_capture_qa_${suffix}`, role, originSector]
    );
    const userId = result.rows[0].id;
    await db.query(
      "INSERT INTO user_sector_permissions (user_id, sector_id, can_read, can_capture) " +
      "VALUES ($1,$2,TRUE,$3)",
      [userId, sectors[originSector], authorized]
    );
    return userId;
  }

  const laboratory = await fixture("laboratory", "LABORATORY", true, "lab");
  const operator = await fixture("operator", "PRODUCTION", true, "prod");
  const blocked = await fixture("laboratory", "LABORATORY", false, "blocked");

  await assertAccess(laboratory, "PRODUCTION", "capture", false);
  await assertAccess(operator, "LABORATORY", "capture", false);

  // O instalador usa transações independentes; este teste executa o mesmo
  // conteúdo dentro do rollback que protege os fixtures.
  const migration = await readFile(
    new URL("../migrations/025_reconcile_cross_sector_capture_permissions.sql", import.meta.url),
    "utf8"
  );
  await db.query(migration.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, ""));

  await assertAccess(laboratory, "PRODUCTION", "capture", true);
  await assertAccess(operator, "LABORATORY", "capture", true);
  await assertAccess(laboratory, "PRODUCTION", "open", false);
  await assertAccess(laboratory, "PRODUCTION", "move", false);
  await assertAccess(operator, "LABORATORY", "open", false);
  await assertAccess(operator, "LABORATORY", "move", false);
  await assertAccess(blocked, "PRODUCTION", "capture", false);
  await assertAccess(blocked, "LABORATORY", "capture", false);

  const rows = (await db.query(
    "SELECT sector_id, can_capture, can_open, can_move FROM user_sector_permissions " +
    "WHERE user_id = $1",
    [laboratory]
  )).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.can_capture === true && row.can_open === false && row.can_move === false));
  console.log("PASS PostgreSQL: usuário laboratório captura na Produção e vice-versa sem ampliar outras ações");
} finally {
  await db.query("ROLLBACK").catch(() => undefined);
  await db.end();
}
