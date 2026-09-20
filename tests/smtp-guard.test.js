import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {sendReservedGmail} from '../supabase/functions/fraid-scheduled-reports/smtp-delivery.js';
const migration=await readFile(new URL('../supabase/migrations/20260920153523_fraid_smtp_attempt_guard.sql',import.meta.url),'utf8');
const baseline=migration.match(/\$expected\$([\s\S]*?)\$expected\$/)[1];
const dataMigration=await readFile(new URL('../supabase/migrations/20260920154749_fraid_report_data_access.sql',import.meta.url),'utf8');
const original=await readFile(new URL('../db/reports-and-expiry.sql',import.meta.url),'utf8');
const payload={to:['synthetic@example.com'],subject:'Synthetic',text:'Test'};
test('SQL reservation fences stale workers, crashes and retries; preserves ordinary push handling',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create schema fraid_private;');
  for(const ddl of original.match(/create table fraid_private\.(deliveries|job_config|job_health)\([^;]+;/g))await db.exec(ddl);
  await db.exec(baseline);
  await db.exec("create role anon; create role service_role; revoke all on function fraid_private.job_control(jsonb) from public; grant usage on schema fraid_private to service_role; grant execute on function fraid_private.job_control(jsonb) to service_role; create table public.fraid_v2_people(id text); create table public.fraid_v2_records(id text,kind text,data jsonb); insert into public.fraid_v2_records values ('1','entries','{}'),('2','notes','{}'),('3','wages','{}');");
  await db.exec(migration);
  await db.exec(dataMigration);
  const control=async p=>(await db.query('select fraid_private.job_control($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
  await db.exec('set role anon');
  await assert.rejects(()=>control({action:'report_data'}),/permission denied/);
  await db.exec('reset role; set role service_role');
  const reportData=await control({action:'report_data'});
  assert.deepEqual(reportData.records.map(r=>r.kind),['entries','wages']);
  await db.exec('reset role');
  const state=async key=>(await db.query('select status,attempts from fraid_private.deliveries where key=$1',[key])).rows[0];
  const expire=key=>db.query("update fraid_private.deliveries set lease_until=now()-interval '1 day' where key=$1",[key]);
  const claim=key=>control({action:'claim',key,report:payload});
  const key='payroll-test:2026-08';
  const first=await claim(key);await expire(key);const second=await claim(key);
  assert.equal(first.attempt,1);assert.equal(second.attempt,2);
  assert.equal((await control({action:'smtp_reserve',key,attempt:first.attempt})).reserved,false);
  const reserved=await control({action:'smtp_reserve',key,attempt:second.attempt});assert.equal(reserved.reserved,true);
  assert.equal((await control({action:'smtp_reserve',key,attempt:second.attempt})).reserved,false);
  // Simulated crash after reservation, including an expired lease: still terminal.
  await expire(key);assert.equal((await claim(key)).claimed,false);
  await control({action:'finish',key,ok:false});assert.equal((await state(key)).status,'uncertain');
  assert.equal((await control({action:'smtp_finish',key,attemptToken:'wrong',ok:true})).recorded,false);
  assert.equal((await control({action:'smtp_finish',key,attemptToken:reserved.attemptToken,ok:true,providerId:'synthetic'})).recorded,true);
  assert.equal((await state(key)).status,'sent');assert.equal((await claim(key)).claimed,false);
  let sends=0;
  const transport=()=>({sendMail:async()=>{sends++;return {accepted:['synthetic@example.com'],rejected:[],messageId:'synthetic'};},close(){}});
  const lostReserve='payroll-test:2026-07',c=await claim(lostReserve);
  const lost=await sendReservedGmail(async p=>{const r=await control(p);if(p.action==='smtp_reserve')throw Error('Response lost');return r;},lostReserve,c,'synthetic@gmail.com','synthetic',transport);
  assert.equal(lost.state,'reservation_unconfirmed');assert.equal(sends,0);assert.equal((await claim(lostReserve)).claimed,false);
  const lostFinish='payroll-test:2026-06',d=await claim(lostFinish);
  const uncertain=await sendReservedGmail(async p=>{if(p.action==='smtp_finish')throw Error('Write unavailable');return control(p);},lostFinish,d,'synthetic@gmail.com','synthetic',transport);
  assert.equal(uncertain.state,'uncertain');assert.equal(sends,1);await expire(lostFinish);assert.equal((await claim(lostFinish)).claimed,false);
  const push='expiry:synthetic';await claim(push);await control({action:'finish',key:push,ok:false});await expire(push);assert.equal((await claim(push)).claimed,true);
  await control({action:'finish',key:push,ok:true});await expire(push);assert.equal((await claim(push)).claimed,false);
  // Rollback restores code only, never erases ambiguous attempts or delivery history.
  await db.query("update fraid_private.deliveries set lease_until='infinity' where status='uncertain'");
  await db.exec(baseline);assert.equal((await claim(lostFinish)).claimed,false);
 }finally{await db.close();}
});
