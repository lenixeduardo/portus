/**
 * Migração independente do aplicativo. Executar em cada estação ANTES de
 * instalar a versão sem SQLite; nunca excluir o arquivo SQLite original.
 *
 * PORTUS_ADMIN_DATABASE_URL=postgresql://... node scripts/import-legacy-to-postgres.mjs \
 *   --sqlite=/path/to/serial-reader.sqlite --station=PRODUCAO-01 --sector=PRODUCTION
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import initSqlJs from "sql.js";
import pg from "pg";

const { Client } = pg;
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const idx = arg.indexOf("=");
  return idx === -1 ? [arg.replace(/^--/, ""), "true"]
    : [arg.slice(2,idx), arg.slice(idx+1)];
}));
const sqlitePath = args.sqlite ? resolve(args.sqlite) : null;
const connectionString = process.env.PORTUS_ADMIN_DATABASE_URL;
const sector = args.sector?.toUpperCase();
const station = args.station?.trim().toUpperCase();
if (!sqlitePath || !existsSync(sqlitePath) || !connectionString ||
    !station || !/^[A-Z0-9._-]{2,64}$/.test(station) ||
    !["PRODUCTION","LABORATORY"].includes(sector)) {
  console.error("Obrigatório: PORTUS_ADMIN_DATABASE_URL e --sqlite=ARQUIVO --station=CODIGO --sector=PRODUCTION|LABORATORY");
  process.exit(2);
}

const backupDir = resolve(args["backup-dir"] || dirname(sqlitePath));
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g,"-");
const sourceBackup = join(backupDir, basename(sqlitePath) + "." + stamp + ".pre-postgres.bak");
copyFileSync(sqlitePath, sourceBackup);
console.log("Backup SQLite original preservado:", sourceBackup);

if (args["skip-postgres-backup"] !== "true") {
  const url = new URL(connectionString);
  const dump = join(backupDir, "portus-central." + stamp + ".pre-import.dump");
  const env = {
    ...process.env,
    PGHOST:url.hostname, PGPORT:url.port || "5432",
    PGUSER:decodeURIComponent(url.username),
    PGPASSWORD:decodeURIComponent(url.password),
    PGDATABASE:decodeURIComponent(url.pathname.slice(1))
  };
  try {
    execFileSync(args["pg-dump"] || "pg_dump", ["-Fc","--no-owner","--no-acl","-f",dump], {
      env, timeout:180000, stdio:["ignore","pipe","pipe"]
    });
    console.log("Backup PostgreSQL preservado:", dump);
  } catch (error) {
    console.error("Falha no pg_dump; importação abortada ANTES de escrever no PostgreSQL.");
    throw error;
  }
}

const SQL = await initSqlJs();
const sqlite = new SQL.Database(readFileSync(sqlitePath));
const pgClient = new Client({ connectionString });
const importedCounts = new Map();

function rows(query) {
  const result = sqlite.exec(query);
  if (!result.length) return [];
  return result[0].values.map(values =>
    Object.fromEntries(result[0].columns.map((col,i)=>[col,values[i]]))
  );
}
function hasTable(name) {
  return rows("SELECT name FROM sqlite_master WHERE type='table' AND name='" +
    name.replace(/'/g,"''") + "'").length > 0;
}
function sourceRows(table) {
  if (!hasTable(table)) return [];
  const entries = rows("SELECT * FROM " + table);
  return entries.sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
}
function checksum(row) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}
function dateValue(value) {
  if (!value) return null;
  const text = String(value);
  return /Z$|[+-]\d{2}:\d{2}$/.test(text) ? text : text.replace(" ","T") + "Z";
}
async function selectOne(sql, params=[]) {
  return (await pgClient.query(sql,params)).rows[0] ?? null;
}
async function transfer(type, localRow, callback) {
  const hash = checksum(localRow);
  const existing = await selectOne(
    "SELECT central_id,source_hash FROM portus_legacy_import_ledger " +
    "WHERE station_code=$1 AND entity_type=$2 AND local_id=$3",
    [station,type,localRow.id]
  );
  if (existing) {
    if (existing.source_hash !== hash) {
      throw new Error("Registro local foi alterado após importação: " + type + " ID " + localRow.id);
    }
    return Number(existing.central_id);
  }
  const id = Number(await callback());
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID central inválido para " + type);
  await pgClient.query(
    "INSERT INTO portus_legacy_import_ledger " +
    "(station_code,entity_type,local_id,central_id,source_hash) VALUES ($1,$2,$3,$4,$5)",
    [station,type,localRow.id,id,hash]
  );
  importedCounts.set(type,(importedCounts.get(type)||0)+1);
  return id;
}
function normalizedRole(u) {
  if (u.role === "operator" && u.sector_code === "LABORATORY") return "laboratory";
  return u.role || "operator";
}
const userIds = new Map();
const productIds = new Map();
const equipmentIds = new Map();
const batchIds = new Map();
const sessionIds = new Map();
const originalCounts = {};

try {
  await pgClient.connect();
  await pgClient.query("BEGIN");
  const ready = await selectOne(
    "SELECT to_regclass('public.portus_legacy_import_ledger') IS NOT NULL AS ready"
  );
  if (!ready?.ready) throw new Error("Migration 014 não aplicada no servidor.");

  const sec = await selectOne("SELECT id FROM sectors WHERE code=$1 AND active",[sector]);
  const appCode = sector === "LABORATORY" ? "PORTUS_LABORATORY" : "PORTUS";
  const app = await selectOne("SELECT id FROM applications WHERE code=$1 AND active",[appCode]);
  if (!sec || !app) throw new Error("Setor/aplicação não configurados no PostgreSQL.");
  const st = await selectOne(
    "INSERT INTO stations(sector_id,code,name) VALUES($1,$2,$3) " +
    "ON CONFLICT(sector_id,code) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [sec.id,station,station]
  );
  const stationId = st.id;

  for (const u of sourceRows("users")) {
    const role = normalizedRole(u);
    const uSector = u.sector_code || "PRODUCTION";
    if (uSector !== "PRODUCTION" && uSector !== "LABORATORY")
      throw new Error("Setor inválido do usuário: " + u.username);
    if (!u.password_hash) throw new Error("Hash de senha ausente: " + u.username);
    const id = await transfer("users",u, async()=>{
      const existing = await selectOne(
        "SELECT id,role,sector_code,password_hash,barcode_value,active FROM users " +
        "WHERE lower(username)=lower($1)", [u.username]
      );
      if (existing) {
        if (!existing.active || existing.role !== role || existing.sector_code !== uSector ||
            (existing.password_hash !== "managed-by-portus" &&
             existing.password_hash !== u.password_hash) ||
            (existing.barcode_value && u.barcode_value &&
             existing.barcode_value.toLowerCase() !== u.barcode_value.toLowerCase())) {
          throw new Error("Conflito de identidade central do usuário: " + u.username);
        }
        await pgClient.query(
          "UPDATE users SET password_hash=CASE WHEN password_hash='managed-by-portus' " +
          "THEN $1 ELSE password_hash END, " +
          "barcode_value=COALESCE(barcode_value,$2), " +
          "display_name=COALESCE(display_name,$3) WHERE id=$4",
          [u.password_hash,u.barcode_value||null,u.display_name||null,existing.id]
        );
        return existing.id;
      }
      const result = await selectOne(
        "INSERT INTO users(username,password_hash,display_name,barcode_value,role,active,sector_code,laboratory_profile) " +
        "VALUES($1,$2,$3,$4,$5,TRUE,$6,$7) RETURNING id",
        [u.username,u.password_hash,u.display_name||null,u.barcode_value||null,
          role,uSector,u.laboratory_profile||null]
      );
      return result.id;
    });
    userIds.set(Number(u.id),id);
    const sectorRow = await selectOne("SELECT id FROM sectors WHERE code=$1",[uSector]);
    await pgClient.query(
      "INSERT INTO user_sector_permissions " +
      "(user_id,sector_id,can_read,can_open,can_capture,can_move,can_confirm_production,can_confirm_laboratory) " +
      "VALUES($1,$2,TRUE,$3,$4,$5,FALSE,FALSE) ON CONFLICT(user_id,sector_id) DO UPDATE SET " +
      "can_read=EXCLUDED.can_read,can_open=EXCLUDED.can_open,can_capture=EXCLUDED.can_capture,can_move=EXCLUDED.can_move",
      [id,sectorRow.id,role!=="supervisor",role!=="supervisor",uSector==="PRODUCTION" && role!=="supervisor"]
    );
  }
  originalCounts.users = sourceRows("users").length;

  const allProducts = sourceRows("products");
  for (const p of allProducts) {
    const creator = userIds.get(Number(p.created_by));
    const creatorRow = sourceRows("users").find(u=>Number(u.id)===Number(p.created_by));
    if (!creator || !creatorRow) throw new Error("Produto sem criador: " + p.id);
    const id = await transfer("products",p,async()=>{
      const existing = await selectOne(
        "SELECT id,description FROM products WHERE lower(name)=lower($1)",
        [p.name]
      );
      if (existing) {
        if (existing.description && p.description &&
            existing.description.trim() !== p.description.trim()) {
          throw new Error("Códigos conflitantes para produto: "+p.name);
        }
        return existing.id;
      }
      const saved = await selectOne("SELECT portus_save_product(NULL,$1,$2,$3) AS id",
        [p.name,p.description||null,creatorRow.username]);
      return saved.id;
    });
    productIds.set(Number(p.id),id);
  }
  originalCounts.products=allProducts.length;

  const centralEquipments = (await pgClient.query(
    "SELECT id,code,name FROM equipments ORDER BY id"
  )).rows;
  const slotCodes=["ESPECTROFOTOMETRO","BALANCA","VISCOSIMETRO","PH_METRO","REFRATOMETRO","RESERVA"];
  const legacyEquipments=sourceRows("equipments");
  for (const eq of legacyEquipments) {
    const chosen=centralEquipments.find(e=>e.code===slotCodes[Number(eq.slot_index)-1]);
    if (!chosen) throw new Error("Equipamento central ausente, slot: "+eq.slot_index);
    const id=await transfer("equipments",eq,async()=>{
      const config={
        id:Number(chosen.id), name:eq.name,slotIndex:Number(eq.slot_index),
        portPath:eq.port_path||"", baudRate:eq.baud_rate||9600,
        dataBits:eq.data_bits||8,stopBits:eq.stop_bits||1,parity:eq.parity||"none",
        enabled:!!eq.enabled,parseRegex:eq.parse_regex??undefined,
        lineDelimiter:eq.line_delimiter||"lf",
        skipFirstReading:!!eq.skip_first_reading,
        stopAfterFirstReading:!!eq.stop_after_first_reading,
        protocol:eq.protocol||"passive",modbusUnitId:eq.modbus_unit_id??1,
        modbusFunction:eq.modbus_function??3,modbusStartAddress:eq.modbus_start_address??0,
        modbusQuantity:eq.modbus_quantity??2,modbusRegisterDecode:eq.modbus_register_decode||"uint16",
        modbusPollIntervalMs:eq.modbus_poll_interval_ms||1000,
        modbusResponseTimeoutMs:eq.modbus_response_timeout_ms||1000,
        scaleEnabled:!!eq.scale_enabled,scaleRawMin:eq.scale_raw_min??undefined,
        scaleRawMax:eq.scale_raw_max??undefined,scaleOutMin:eq.scale_out_min??undefined,
        scaleOutMax:eq.scale_out_max??undefined
      };
      const exists=await selectOne(
        "SELECT equipment_id FROM portus_station_equipment_profiles " +
        "WHERE station_code=$1 AND slot_index=$2",
        [station,eq.slot_index]
      );
      if (exists && Number(exists.equipment_id)!==Number(chosen.id)) {
        throw new Error("Conflito configuração equipamento slot "+eq.slot_index);
      }
      await pgClient.query(
        "INSERT INTO portus_station_equipment_profiles(station_code,slot_index,equipment_id,config) " +
        "VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(station_code,slot_index) DO NOTHING",
        [station,eq.slot_index,chosen.id,JSON.stringify(config)]
      );
      return chosen.id;
    });
    equipmentIds.set(Number(eq.id),id);
  }
  originalCounts.equipments=legacyEquipments.length;

  const configs=sourceRows("settings");
  for (const item of configs) {
    if (item.key==="station_code" || item.key.startsWith("central_")) continue;
    await pgClient.query(
      "INSERT INTO portus_station_settings(station_code,key,value) " +
      "VALUES($1,$2,$3) ON CONFLICT(station_code,key) DO NOTHING",
      [station,item.key,item.value]
    );
  }

  const localBatches=sourceRows("batches");
  for (const b of localBatches) {
    const creator=userIds.get(Number(b.created_by));
    const product=productIds.get(Number(b.product_id));
    if (!creator || !product) throw new Error("Lote órfão: " + b.code);
    const id=await transfer("batches",b,async()=>{
      const collision=await selectOne("SELECT id FROM batches WHERE code=$1",[b.code]);
      if (collision) throw new Error("Código do lote já presente sem ledger: "+b.code);
      const closed=b.status==="closed";
      const opened=dateValue(b.opened_at)||new Date().toISOString();
      const inserted=await selectOne(
        "INSERT INTO batches(product_id,code,status,stage,opened_at,closed_at,created_by,closed_by,opened_source,closed_source) " +
        "VALUES($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8,$9,$10) RETURNING id",
        [product,b.code,closed?"closed":"open",b.stage||"A",opened,
         closed ? dateValue(b.closed_at)||opened : null,
         creator,b.closed_by?userIds.get(Number(b.closed_by))||null:null,
         station,closed?station:null]
      );
      return inserted.id;
    });
    batchIds.set(Number(b.id),id);
  }
  originalCounts.batches=localBatches.length;

  const localSessions=sourceRows("capture_sessions");
  for (const s of localSessions) {
    const batch=batchIds.get(Number(s.batch_id));
    if (!batch) throw new Error("Sessão sem lote de origem: "+s.id);
    const creator=localBatches.find(b=>Number(b.id)===Number(s.batch_id));
    const user=userIds.get(Number(creator?.created_by));
    const id=await transfer("capture_sessions",s,async()=>{
      const inserted=await selectOne(
        "INSERT INTO capture_sessions " +
        "(batch_id,sector_id,station_id,source_application_id,user_id,started_at,ended_at,timeout_seconds,status) " +
        "VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9) RETURNING id",
        [batch,sec.id,stationId,app.id,user,dateValue(s.started_at),
         dateValue(s.ended_at),s.timeout_seconds,s.status]
      );
      return inserted.id;
    });
    sessionIds.set(Number(s.id),id);
  }
  originalCounts.capture_sessions=localSessions.length;

  const localReadings=sourceRows("readings");
  for (const reading of localReadings) {
    const batch=batchIds.get(Number(reading.batch_id));
    const session=sessionIds.get(Number(reading.capture_session_id));
    const eq=equipmentIds.get(Number(reading.equipment_id));
    if (!batch || !session || !eq) throw new Error("Leitura órfã: "+reading.id);
    await transfer("readings",reading,async()=>{
      const inserted=await selectOne(
        "INSERT INTO readings(batch_id,equipment_id,capture_session_id,value_raw,value_parsed,parse_failure_reason,parse_regex_used,captured_at) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz) RETURNING id",
        [batch,eq,session,reading.value_raw,reading.value_parsed,
         reading.parse_failure_reason||null,reading.parse_regex_used||null,dateValue(reading.captured_at)]
      );
      return inserted.id;
    });
  }
  originalCounts.readings=localReadings.length;

  const localAudits=sourceRows("audit_log");
  for (const event of localAudits) {
    await transfer("audit_log",event,async()=>{
      const inserted=await selectOne(
        "INSERT INTO portus_audit_log(actor_user_id,station_code,action,resource_type,resource_id,details,created_at) " +
        "VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) RETURNING id",
        [event.actor_user_id?userIds.get(Number(event.actor_user_id))||null:null,
         station,event.action,event.resource_type,event.resource_id||null,
         event.details_json||"{}",dateValue(event.created_at)]
      );
      return inserted.id;
    });
  }
  originalCounts.audit_log=localAudits.length;

  const localErrors=sourceRows("capture_error_logs");
  for (const err of localErrors) {
    await transfer("capture_error_logs",err,async()=>{
      const inserted=await selectOne(
        "INSERT INTO capture_error_logs(batch_id,capture_session_id,equipment_id,slot_index,severity,code,message,raw_value,context_json,created_at) " +
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::timestamptz) RETURNING id",
        [err.batch_id?batchIds.get(Number(err.batch_id))||null:null,
         err.capture_session_id?sessionIds.get(Number(err.capture_session_id))||null:null,
         err.equipment_id?equipmentIds.get(Number(err.equipment_id))||null:null,
         err.slot_index||null,err.severity,err.code,err.message,
         err.raw_value||null,err.context_json||"{}",dateValue(err.created_at)]
      );
      return inserted.id;
    });
  }
  originalCounts.capture_error_logs=localErrors.length;

  for (const [type,count] of Object.entries(originalCounts)) {
    const actual=await selectOne(
      "SELECT COUNT(*)::integer AS count FROM portus_legacy_import_ledger " +
      "WHERE station_code=$1 AND entity_type=$2",[station,type]
    );
    if (actual.count!==count) {
      throw new Error("Conciliação falhou para "+type+" (local="+count+", central="+actual.count+")");
    }
  }
  await pgClient.query("COMMIT");
  console.log("IMPORTAÇÃO CONCILIADA:",JSON.stringify({
    station, sector, total:originalCounts,
    newlyInserted:Object.fromEntries(importedCounts)
  },null,2));
  console.log("Arquivo SQLite original e backup mantidos intactos.");
} catch(error) {
  await pgClient.query("ROLLBACK").catch(()=>undefined);
  console.error("MIGRAÇÃO REVERTIDA SEM ALTERAR O SQLITE:",error.message);
  process.exitCode=1;
} finally {
  await pgClient.end().catch(()=>undefined);
  sqlite.close();
}
