import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
export const userIds={admin:'11111111-1111-4111-8111-111111111111',employee:'22222222-2222-4222-8222-222222222222',outsider:'33333333-3333-4333-8333-333333333333'};
export async function database({patched=true}={}){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,role text,aud text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.fraid_data(id text primary key,value jsonb);
 insert into public.fraid_data values ('fraid-main','{"employees":[]}');`);
 await db.exec(await read('db/install.sql'));await db.exec(await read('db/batch.sql'));
 await db.exec(await read('tests/fixtures/write-record-before.sql'));
 if(patched)await db.exec(await read('supabase/migrations/20260929122858_monday_readiness.sql'));
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${userIds.admin}','admin@example.invalid',now()),('${userIds.employee}','employee@example.invalid',now()),('${userIds.outsider}','outside@example.invalid',now());
 insert into public.fraid_v2_people(id,user_id,name,role) values ('admin','${userIds.admin}','Synthetic Admin','admin'),('employee','${userIds.employee}','Synthetic Employee','employee');
 update fraid_private.release set live=true;`);
 return {
  db,
  async actor(who){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[userIds[who]||'']);await db.exec('set role '+(who==='anon'?'anon':'authenticated'));},
  async write(p){return (await db.query('select public.fraid_v2_write($1::jsonb) result',[JSON.stringify({requestId:crypto.randomUUID(),...p})])).rows[0].result;},
  async seedEntry(id,data){await db.exec('reset role');await db.query("insert into public.fraid_v2_records(kind,id,owner_id,data) values ('entries',$1,'employee',$2::jsonb)",[id,JSON.stringify({date:'2026-09-20',employeeId:'employee',timeIn:'08:00',timeOut:null,status:'open',...data})]);},
  async records(){return (await db.query('select * from public.fraid_v2_records')).rows;},
  close:()=>db.close()
 };
}
