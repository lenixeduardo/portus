import pg from "pg";
import nodemailer from "nodemailer";
const required=["PORTUS_DATABASE_URL","PORTUS_SMTP_HOST","PORTUS_SMTP_USER","PORTUS_SMTP_PASSWORD","PORTUS_SMTP_FROM"];
for(const name of required) if(!process.env[name]) throw Error("Missing "+name);
const pool=new pg.Pool({connectionString:process.env.PORTUS_DATABASE_URL,max:2});
const port=Number(process.env.PORTUS_SMTP_PORT||587);
const mailer=nodemailer.createTransport({host:process.env.PORTUS_SMTP_HOST,port,secure:port===465,auth:{user:process.env.PORTUS_SMTP_USER,pass:process.env.PORTUS_SMTP_PASSWORD}});
let stop=false;
process.on("SIGINT",()=>stop=true);process.on("SIGTERM",()=>stop=true);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function once(){
 const client=await pool.connect();let job;
 try {
  await client.query("BEGIN");
  const r=await client.query("SELECT * FROM portus_error_report_queue WHERE status IN ('pending','failed') AND next_attempt_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1");
  job=r.rows[0];
  if(job) await client.query("UPDATE portus_error_report_queue SET status='sending',attempts=attempts+1 WHERE id=$1",[job.id]);
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}
 if(!job)return false;
 try{
  await mailer.sendMail({from:process.env.PORTUS_SMTP_FROM,to:"lenix.camargo@gmail.com",subject:"[PORTUS] Reportar Erro - "+job.station_name,text:"Máquina: "+job.station_name+"\nDescrição: "+job.description+"\nLog em anexo.",attachments:[{filename:job.attachment_name,content:job.attachment_text,contentType:"text/plain; charset=utf-8"}]});
  await pool.query("UPDATE portus_error_report_queue SET status='sent',sent_at=now(),last_error=NULL WHERE id=$1",[job.id]);
 }catch(e){
  await pool.query("UPDATE portus_error_report_queue SET status='failed',last_error=$2,next_attempt_at=now()+($3::int * interval '1 second') WHERE id=$1",[job.id,String(e).slice(0,500),Math.min(3600,30*2**Math.min(job.attempts,7))]);
 }
 return true;
}
try{while(!stop){try{if(!await once())await wait(5000)}catch(e){console.error(e);await wait(10000)}}}finally{mailer.close();await pool.end()}
