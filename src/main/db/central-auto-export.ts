import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { centralQuery } from "./central-connection";
import { getCentralBatchHistory } from "./central-history-repo";
import { buildCsvContent } from "./central-report-content";

/**
 * Exportação agendada somente no servidor. Consulta a mesma fonte PostgreSQL
 * da UI, sem acesso ao SQLite nem dependência de uma sessão Electron.
 */
export async function runCentralAutoExport(folder: string): Promise<{ exported: number; errors: string[] }> {
  const errors: string[]=[];
  let exported=0;
  mkdirSync(folder, { recursive: true });
  const master=await centralQuery<{
    username: string; sector_code: "PRODUCTION" | "LABORATORY";
  }>(
    "SELECT username,sector_code FROM users WHERE role='master' AND active ORDER BY id LIMIT 1"
  );
  const operator=master.rows[0];
  if (!operator) {
    return { exported: 0, errors: ["Não existe Master ativo para autorizar a exportação central."] };
  }
  const result=await centralQuery<{id:number|string;code:string}>(
    "SELECT b.id,b.code FROM batches b " +
    "LEFT JOIN portus_auto_exports e ON e.batch_id=b.id " +
    "WHERE b.status='closed' AND e.batch_id IS NULL ORDER BY b.opened_at"
  );
  for(const row of result.rows){
    try{
      const history=await getCentralBatchHistory(Number(row.id),operator.username,operator.sector_code);
      if(!history) throw new Error("Histórico central ausente.");
      const safeCode=row.code.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);
      const path=join(folder,"lote-"+Number(row.id)+"-"+safeCode+".csv");
      writeFileSync(path,"\uFEFF"+buildCsvContent(history),"utf8");
      await centralQuery(
        "INSERT INTO portus_auto_exports(batch_id,export_path) VALUES($1,$2) " +
        "ON CONFLICT(batch_id) DO NOTHING",
        [row.id,path]
      );
      exported++;
    }catch(error){
      errors.push("Lote "+row.code+": "+String(error));
    }
  }
  return {exported,errors};
}
