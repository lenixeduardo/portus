import type { BatchWithProduct } from "../../shared/ipc";
import { centralQuery } from "./central-connection";

interface CentralBatchRow {
  id: number;
  product_id: number;
  product_name: string;
  code: string;
  status: "open" | "closed";
  stage: string;
  opened_at: string;
  closed_at: string | null;
  closed_by: number | null;
  created_by: number;
  readings_count: string;
  operator_name: string;
}

function toBatch(row: CentralBatchRow): BatchWithProduct {
  return {
    id: row.id,
    productId: row.product_id,
    code: row.code,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    closedBy: row.closed_by ?? undefined,
    createdBy: row.created_by,
    productName: row.product_name,
    operatorName: row.operator_name,
    readingsCount: Number(row.readings_count)
  };
}

const SELECT_BATCH = `
  SELECT b.id, b.product_id, p.name AS product_name, b.code, b.status,
         b.stage, b.opened_at, b.closed_at, b.closed_by, b.created_by,
         u.username AS operator_name,
         (SELECT COUNT(*) FROM readings r WHERE r.batch_id = b.id) AS readings_count
    FROM batches b
    JOIN products p ON p.id = b.product_id
    JOIN users u ON u.id = b.created_by
`;

export async function listCentralOpenBatches(): Promise<BatchWithProduct[]> {
  const result = await centralQuery<CentralBatchRow>(
    `${SELECT_BATCH} WHERE b.status = 'open' ORDER BY b.opened_at DESC`
  );
  return result.rows.map(toBatch);
}


export async function listCentralAllBatches(): Promise<BatchWithProduct[]> {
  const result = await centralQuery<CentralBatchRow>(
    `${SELECT_BATCH} ORDER BY b.opened_at DESC`
  );
  return result.rows.map(toBatch);
}

export async function findCentralBatchByCode(code: string): Promise<BatchWithProduct | null> {
  const result = await centralQuery<CentralBatchRow>(`${SELECT_BATCH} WHERE b.code = $1`, [code.trim()]);
  return result.rows[0] ? toBatch(result.rows[0]) : null;
}

export async function listCentralBatches(): Promise<BatchWithProduct[]> {
  const result = await centralQuery<CentralBatchRow>(
    `${SELECT_BATCH} ORDER BY b.opened_at DESC`
  );
  return result.rows.map(toBatch);
}

async function resolveContext(username: string, sectorCode: string) {
  const result = await centralQuery<{
    user_id: number;
    application_id: number;
    sector_id: number;
  }>(
    `SELECT u.id AS user_id, a.id AS application_id, s.id AS sector_id
       FROM users u
       CROSS JOIN applications a
       CROSS JOIN sectors s
      WHERE u.username = $1
        AND a.code = 'PORTUS'
        AND s.code = $2
        AND u.active AND a.active AND s.active`,
    [username, sectorCode]
  );
  if (!result.rows[0]) throw new Error("Usuário, aplicação ou setor não encontrado na base central.");
  return result.rows[0];
}

export async function openCentralBatch(
  productName: string,
  code: string,
  username: string,
  stage = "A"
): Promise<BatchWithProduct> {
  const context = await resolveContext(username, process.env.PORTUS_SECTOR_CODE ?? "PRODUCTION");
  const product = await centralQuery<{ id: number }>(
    "SELECT id FROM products WHERE name = $1",
    [productName]
  );
  if (!product.rows[0]) throw new Error(`Produto "${productName}" não encontrado na base central.`);
  const result = await centralQuery<{ id: number }>(
    "SELECT id FROM open_batch($1, $2, $3, $4, $5, $6)",
    [product.rows[0].id, code, context.user_id, context.application_id, context.sector_id, stage]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("A base central não retornou o lote criado.");
  const batch = await centralQuery<CentralBatchRow>(`${SELECT_BATCH} WHERE b.id = $1`, [id]);
  if (!batch.rows[0]) throw new Error("Lote criado, mas não foi possível recarregá-lo.");
  return toBatch(batch.rows[0]);
}

export async function confirmCentralProductionClose(id: number, username: string): Promise<BatchWithProduct> {
  return confirmCentralClose(id, username, "PRODUCTION", "confirm_production");
}

export async function confirmCentralLaboratoryClose(id: number, username: string): Promise<BatchWithProduct> {
  return confirmCentralClose(id, username, "LABORATORY", "confirm_laboratory");
}

async function confirmCentralClose(
  id: number,
  username: string,
  sectorCode: string,
  action: "confirm_production" | "confirm_laboratory"
): Promise<BatchWithProduct> {
  const context = await resolveContext(username, sectorCode);
  const fn = action === "confirm_production"
    ? "confirm_production_close"
    : "confirm_laboratory_close";
  const result = await centralQuery<{ id: number }>(
    `SELECT id FROM ${fn}($1, $2, $3, $4)`,
    [id, context.user_id, context.application_id, context.sector_id]
  );
  const batch = await centralQuery<CentralBatchRow>(`${SELECT_BATCH} WHERE b.id = $1`, [result.rows[0]?.id ?? id]);
  if (!batch.rows[0]) throw new Error("Lote não encontrado após confirmação.");
  return toBatch(batch.rows[0]);
}
