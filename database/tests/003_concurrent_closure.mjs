import pg from "pg";

const { Client } = pg;
const connectionString = process.env.PORTUS_DATABASE_URL?.trim();

if (!connectionString) {
  console.error("PORTUS_DATABASE_URL não configurada.");
  process.exit(1);
}

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const username = `stage1_concurrency_${runId}`;
const applicationCode = `STAGE1_CONCURRENCY_${runId}`;
const productName = `Stage 1 Concurrency Product ${runId}`;
const batchCode = `STAGE1-CONCURRENCY-${runId}`;

const setup = new Client({ connectionString, application_name: "portus-concurrency-setup" });
const production = new Client({ connectionString, application_name: "portus-concurrency-production" });
const laboratory = new Client({ connectionString, application_name: "portus-concurrency-laboratory" });

let userId;
let applicationId;
let productId;
let batchId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createFixture() {
  const references = await setup.query(`
    SELECT
      (SELECT id FROM sectors WHERE code = 'PRODUCTION') AS production_sector_id,
      (SELECT id FROM sectors WHERE code = 'LABORATORY') AS laboratory_sector_id
  `);
  const reference = references.rows[0];
  assert(reference.production_sector_id, "Setor PRODUCTION não encontrado. Execute o seed de referência.");
  assert(reference.laboratory_sector_id, "Setor LABORATORY não encontrado. Execute o seed de referência.");

  const application = await setup.query(
    `INSERT INTO applications (code, name)
     VALUES ($1, 'Stage 1 Concurrency Test')
     RETURNING id`,
    [applicationCode]
  );
  applicationId = application.rows[0].id;
  reference.application_id = applicationId;

  const user = await setup.query(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES ($1, 'not-used-in-concurrency-test', 'Stage 1 Concurrency Test', 'operator')
     RETURNING id`,
    [username]
  );
  userId = user.rows[0].id;

  await setup.query(
    `INSERT INTO user_sector_permissions (
       user_id, sector_id, can_read, can_open, can_capture, can_move,
       can_confirm_production, can_confirm_laboratory
     ) VALUES
       ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
       ($1, $3, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE)`,
    [userId, reference.production_sector_id, reference.laboratory_sector_id]
  );

  await setup.query(
    `INSERT INTO application_sector_permissions (
       application_id, sector_id, can_read, can_open, can_capture, can_move,
       can_confirm_production, can_confirm_laboratory
     ) VALUES
       ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
       ($1, $3, TRUE, FALSE, TRUE, TRUE, FALSE, TRUE)`,
    [reference.application_id, reference.production_sector_id, reference.laboratory_sector_id]
  );

  const product = await setup.query(
    `INSERT INTO products (name, description, created_by)
     VALUES ($1, 'Disposable concurrent closure fixture', $2)
     RETURNING id`,
    [productName, userId]
  );
  productId = product.rows[0].id;

  const batch = await setup.query(
    `SELECT id FROM open_batch($1, $2, $3, $4, $5, 'A')`,
    [productId, batchCode, userId, reference.application_id, reference.production_sector_id]
  );
  batchId = batch.rows[0].id;

  return reference;
}

async function runConcurrentClosure(reference) {
  await production.query("BEGIN");
  await production.query("SET LOCAL statement_timeout = '10s'");
  await production.query("SELECT id FROM batches WHERE id = $1 FOR UPDATE", [batchId]);

  const laboratoryStartedAt = Date.now();
  const laboratoryConfirmation = laboratory.query(
    "SELECT * FROM confirm_laboratory_close($1, $2, $3, $4)",
    [batchId, userId, reference.application_id, reference.laboratory_sector_id]
  );

  // Mantém o lock tempo suficiente para comprovar que a segunda sessão aguarda.
  await delay(250);

  const productionResult = await production.query(
    "SELECT * FROM confirm_production_close($1, $2, $3, $4)",
    [batchId, userId, reference.application_id, reference.production_sector_id]
  );
  await production.query("COMMIT");

  const laboratoryResult = await laboratoryConfirmation;
  const laboratoryWaitMs = Date.now() - laboratoryStartedAt;

  assert(productionResult.rows[0].production_closed, "Produção não registrou sua confirmação.");
  assert(laboratoryResult.rows[0].status === "closed", "Laboratório não observou o fechamento global.");
  assert(laboratoryWaitMs >= 200, "A segunda sessão não aguardou o lock do lote como esperado.");

  return laboratoryWaitMs;
}

async function validateFinalState(laboratoryWaitMs, reference) {
  const state = await setup.query(
    `SELECT status, production_closed, laboratory_closed, version, closed_at
       FROM batches
      WHERE id = $1`,
    [batchId]
  );
  const batch = state.rows[0];

  assert(batch.status === "closed", "Estado final do lote deveria ser closed.");
  assert(batch.production_closed === true, "Confirmação final da Produção ausente.");
  assert(batch.laboratory_closed === true, "Confirmação final do Laboratório ausente.");
  assert(Number(batch.version) === 2, `Versão final esperada: 2; recebida: ${batch.version}.`);
  assert(batch.closed_at, "Data de fechamento não foi registrada.");

  const history = await setup.query(
    `SELECT action, count(*)::integer AS occurrences
       FROM batch_history
      WHERE batch_id = $1
      GROUP BY action`,
    [batchId]
  );
  const counts = Object.fromEntries(history.rows.map((row) => [row.action, row.occurrences]));
  assert(counts.BATCH_OPENED === 1, "Histórico de abertura deve ocorrer uma vez.");
  assert(counts.PRODUCTION_CLOSE_CONFIRMED === 1, "Confirmação da Produção deve ocorrer uma vez.");
  assert(counts.LABORATORY_CLOSE_CONFIRMED === 1, "Confirmação do Laboratório deve ocorrer uma vez.");
  assert(counts.BATCH_CLOSED === 1, "Fechamento global deve ocorrer uma única vez.");

  const versionBeforeRetry = Number(batch.version);
  await Promise.all([
    production.query(
      "SELECT * FROM confirm_production_close($1, $2, $3, $4)",
      [batchId, userId, reference.application_id, reference.production_sector_id]
    ),
    laboratory.query(
      "SELECT * FROM confirm_laboratory_close($1, $2, $3, $4)",
      [batchId, userId, reference.application_id, reference.laboratory_sector_id]
    )
  ]);

  const retryState = await setup.query("SELECT version FROM batches WHERE id = $1", [batchId]);
  assert(Number(retryState.rows[0].version) === versionBeforeRetry, "Repetição idempotente alterou a versão.");

  console.log("Stage 1 concurrent closure test OK", {
    batchId,
    laboratoryWaitMs,
    status: batch.status,
    version: Number(batch.version),
    history: counts
  });
}

async function cleanup() {
  if (batchId) await setup.query("DELETE FROM batches WHERE id = $1", [batchId]);
  if (productId) await setup.query("DELETE FROM products WHERE id = $1", [productId]);
  if (userId) await setup.query("DELETE FROM users WHERE id = $1", [userId]);
  if (applicationId) await setup.query("DELETE FROM applications WHERE id = $1", [applicationId]);
}

try {
  await Promise.all([setup.connect(), production.connect(), laboratory.connect()]);
  await Promise.all([
    setup.query("SET statement_timeout = '15s'"),
    production.query("SET statement_timeout = '15s'"),
    laboratory.query("SET statement_timeout = '15s'")
  ]);
  const reference = await createFixture();
  const waitMs = await runConcurrentClosure(reference);
  await validateFinalState(waitMs, reference);
} catch (error) {
  try { await production.query("ROLLBACK"); } catch {}
  console.error("Stage 1 concurrent closure test FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch (error) {
    console.error("Falha ao remover fixtures do teste:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  await Promise.allSettled([setup.end(), production.end(), laboratory.end()]);
}
