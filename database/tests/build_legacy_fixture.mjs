// Fixture de integração: SQLite das duas estações antigas.
import { writeFileSync } from "node:fs";
import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";

const filename=process.argv[2];
const sector=process.argv[3];
if(!filename || !["PRODUCTION","LABORATORY"].includes(sector)) {
  throw new Error("Uso: node build_legacy_fixture.mjs output.sqlite PRODUCTION|LABORATORY");
}
const db=new (await initSqlJs()).Database();
for(const sql of [
"CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,display_name TEXT,barcode_value TEXT,role TEXT,sector_code TEXT,laboratory_profile TEXT,created_at TEXT)",
"CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,description TEXT,created_by INTEGER,created_at TEXT)",
"CREATE TABLE equipments(id INTEGER PRIMARY KEY,name TEXT,slot_index INTEGER,port_path TEXT,baud_rate INTEGER,data_bits INTEGER,stop_bits INTEGER,parity TEXT,enabled INTEGER,parse_regex TEXT,line_delimiter TEXT,skip_first_reading INTEGER,stop_after_first_reading INTEGER,protocol TEXT)",
"CREATE TABLE settings(key TEXT,value TEXT)",
"CREATE TABLE batches(id INTEGER PRIMARY KEY,product_id INTEGER,code TEXT,status TEXT,stage TEXT,opened_at TEXT,closed_at TEXT,created_by INTEGER,closed_by INTEGER)",
"CREATE TABLE capture_sessions(id INTEGER PRIMARY KEY,batch_id INTEGER,started_at TEXT,ended_at TEXT,timeout_seconds INTEGER,status TEXT)",
"CREATE TABLE readings(id INTEGER PRIMARY KEY,batch_id INTEGER,equipment_id INTEGER,value_raw TEXT,value_parsed TEXT,captured_at TEXT,capture_session_id INTEGER)",
"CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_user_id INTEGER,action TEXT,resource_type TEXT,resource_id TEXT,details_json TEXT,created_at TEXT)",
"CREATE TABLE capture_error_logs(id INTEGER PRIMARY KEY,batch_id INTEGER,capture_session_id INTEGER,equipment_id INTEGER,slot_index INTEGER,severity TEXT,code TEXT,message TEXT,raw_value TEXT,context_json TEXT,created_at TEXT)"
]) db.run(sql);
const lab=sector==="LABORATORY";
const user=lab?"analista.central.teste":"operador.central.teste";
const code=lab?"LEGACY-LAB-01":"LEGACY-PROD-01";
const now="2026-10-08 14:01:00";
db.run("INSERT INTO users VALUES (1,?,?,?,?,?,?,?,?)",
  [user,bcrypt.hashSync("Senh@Teste2026",10),user,lab?"LAB001":"PROD001","operator",sector,lab?"capture":null,now]);
if (!lab) db.run("INSERT INTO users VALUES (2,?,?,?,?,?,?,?,?)",
  ["admin",bcrypt.hashSync("admin",10),"Administrador legado",null,"master","PRODUCTION",null,now]);
db.run("INSERT INTO products VALUES (1,?,?,1,?)",["Produto compartilhado para importação","REF-IMPORT-001",now]);
db.run("INSERT INTO equipments VALUES (1,'Balança',2,'COM4',9600,8,1,'none',1,'numeric','lf',0,1,'passive')");
db.run("INSERT INTO settings VALUES ('station_sector_code',?)",[sector]);
db.run("INSERT INTO settings VALUES ('capture_timeout_seconds','30')");
db.run("INSERT INTO batches VALUES (1,1,?,'closed','A',?, ?,1,1)",[code,now,"2026-10-08 14:04:00"]);
db.run("INSERT INTO capture_sessions VALUES (1,1,?, ?,30,'completed')",[now,"2026-10-08 14:02:00"]);
db.run("INSERT INTO readings VALUES (1,1,1,'10.5','10.5',?,1)",["2026-10-08 14:01:35"]);
db.run("INSERT INTO audit_log VALUES (1,1,'capture.test','batch','1','{}',?)",[now]);
db.run("INSERT INTO capture_error_logs VALUES (1,1,1,1,2,'warn','test','Teste','10.5','{}',?)",[now]);
writeFileSync(filename,Buffer.from(db.export()));
db.close();
console.log(filename, sector);
