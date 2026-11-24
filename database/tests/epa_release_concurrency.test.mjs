import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

if (process.env.PORTUS_EPA_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Execute o teste somente em banco descartável com PORTUS_EPA_DISPOSABLE_DATABASE=1.");
}

const admin = new pg.Client();
const first = new pg.Client();
const second = new pg.Client();

try {
  await Promise.all([admin.connect(), first.connect(), second.connect()]);
  await second.query("SET statement_timeout = '10s'");
  const { rows: [context] } = await admin.query(`
    WITH actor AS (
      INSERT INTO users (username, display_name, password_hash, role)
      VALUES ('qa_epa_concurrency', 'QA EPA Concurrency', 'unused', 'master') RETURNING id
    ), product AS (
      INSERT INTO products (name, created_by) SELECT 'QA EPA concurrency', id FROM actor RETURNING id
    ), batch AS (
      INSERT INTO batches (product_id, code, created_by)
      SELECT product.id, 'QA-EPA-CONCURRENCY', actor.id FROM product CROSS JOIN actor
      RETURNING id
    )
    SELECT batch.id AS batch, actor.id AS actor, a.id AS application, s.id AS sector
      FROM batch CROSS JOIN actor CROSS JOIN applications a CROSS JOIN sectors s
     WHERE a.code = 'PORTUS' AND s.code = 'PRODUCTION'
  `);
  const args = [context.batch, context.actor, context.application, context.sector];
  const finalize = "SELECT id, status FROM supervisor_finalize_batch($1,$2,$3,$4)";

  await admin.query("SELECT set_batch_completed($1,$2,$3,$4,true)", args);
  await first.query("BEGIN");
  assert.equal((await first.query(finalize, args)).rows[0].status, "closed");
  const { rows: [{ pid }] } = await second.query("SELECT pg_backend_pid() AS pid");
  const concurrent = second.query(finalize, args);
  // Attach a rejection handler before observing the lock from a third session.
  concurrent.catch(() => {});
  const deadline = Date.now() + 5000;
  let blockers = [];
  while (blockers.length === 0 && Date.now() < deadline) {
    ({ rows: [{ blockers }] } = await admin.query("SELECT pg_blocking_pids($1) AS blockers", [pid]));
    if (!blockers.length) await delay(20);
  }
  await first.query("COMMIT");
  assert.equal((await concurrent).rows[0].status, "closed");
  assert.ok(blockers.length > 0, "A segunda finalização deveria aguardar a primeira");
  const { rows: [{ count }] } = await admin.query(
    "SELECT count(*) FROM batch_history WHERE batch_id = $1 AND action = 'BATCH_FINALIZED'", [context.batch]
  );
  assert.equal(count, "1");

  await admin.query("UPDATE lab_feature_flags SET enabled = true WHERE code = 'release_gate'");
  await admin.query("SELECT master_reopen_batch($1,$2,$3,$4,'QA reabertura para concorrência')", args);
  await admin.query("SELECT set_batch_completed($1,$2,$3,$4,true)", args);
  const blocked = await Promise.allSettled([first.query(finalize, args), second.query(finalize, args)]);
  assert.ok(blocked.every(outcome => outcome.status === "rejected"
    && outcome.reason.code === "55000" && outcome.reason.message.includes("conformidade laboratorial")));
  const { rows: [{ status, lab_analysis_cycle }] } = await admin.query(
    "SELECT status, lab_analysis_cycle FROM batches WHERE id = $1", [context.batch]
  );
  assert.equal(status, "open");
  assert.equal(lab_analysis_cycle, "2");
  console.log("Finalização concorrente e bloqueio após reabertura validados.");
} finally {
  // Release the batch lock before waiting for the session that may be blocked by it.
  await first.end();
  await Promise.all([admin.end(), second.end()]);
}
