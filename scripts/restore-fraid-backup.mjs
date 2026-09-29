// Offline restore drill for all tables changed/read by this release.
// Auth credentials, Vault secrets and unrelated Biogreens tables are excluded.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const q=x=>'"'+x.replaceAll('"','""')+'"';
const lit=x=>"'"+x.replaceAll("'","''")+"'";
const name=t=>q(t.schema)+'.'+q(t.name);
export async function restoreSnapshot(snapshot){
 const db=new PGlite();
 await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role; create schema auth; create schema fraid_private;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,role text,aud text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,fraid_private to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;`);
 for(const t of snapshot.meta){
  const cols=t.columns.map(c=>q(c.name)+' '+c.type+(c.identity?' GENERATED '+(c.identity==='a'?'ALWAYS':'BY DEFAULT')+' AS IDENTITY':c.default?' DEFAULT '+c.default:'')+(c.not_null?' NOT NULL':''));
  await db.exec(`create table ${name(t)} (${cols.join(',')});`);
 }
 for(const t of snapshot.meta)for(const c of t.constraints||[])if(!c.definition.startsWith('FOREIGN KEY'))await db.exec(`alter table ${name(t)} add constraint ${q(c.name)} ${c.definition};`);
 const users=new Set(snapshot.rows['public.fraid_v2_people'].map(p=>p.user_id).filter(Boolean));
 for(const p of snapshot.rows['public.fraid_v2_push'])users.add(p.user_id);
 for(const id of users)await db.query('insert into auth.users(id) values ($1)',[id]);
 for(const t of snapshot.meta){
  await db.query(`insert into ${name(t)} overriding system value select * from jsonb_populate_recordset(null::${name(t)},$1::jsonb)`,[JSON.stringify(snapshot.rows[t.schema+'.'+t.name])]);
  for(const index of t.indexes||[])await db.exec(index.replace('INDEX ','INDEX IF NOT EXISTS ')+';');
 }
 for(const t of snapshot.meta)for(const c of t.constraints||[])if(c.definition.startsWith('FOREIGN KEY'))await db.exec(`alter table ${name(t)} add constraint ${q(c.name)} ${c.definition};`);
 for(const f of [...snapshot.functions].sort((a,b)=>(a.schema==='public')-(b.schema==='public')))await db.exec(f.definition);
 const grants={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE'};
 const applyAcl=async(type,target,acl)=>{
  await db.exec(`revoke all on ${type} ${target} from public,anon,authenticated,service_role;`);
  for(const raw of (acl||'{}').slice(1,-1).split(',')){
   const match=raw.match(/^([^=]*)=([^/]+)\//);if(!match)continue;
   const role=match[1]||'PUBLIC';if(!['PUBLIC','anon','authenticated','service_role'].includes(role))continue;
   const perms=[...match[2]].filter(c=>grants[c]).map(c=>grants[c]);
   if(perms.length)await db.exec(`grant ${perms.join(',')} on ${type} ${target} to ${role==='PUBLIC'?'PUBLIC':q(role)};`);
  }
 };
 for(const f of snapshot.functions){const signature=(await db.query('select p.oid::regprocedure::text as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2',[f.schema,f.name])).rows[0].signature;await applyAcl('function',signature,f.acl);}
 for(const t of snapshot.meta){await applyAcl('table',name(t),t.acl);if(t.rls)await db.exec(`alter table ${name(t)} enable row level security;`);if(t.force_rls)await db.exec(`alter table ${name(t)} force row level security;`);}
 for(const p of snapshot.policies||[]){const roles=(Array.isArray(p.roles)?p.roles:String(p.roles).replace(/[{}]/g,'').split(',')).map(r=>r==='public'?'public':q(r)).join(',');await db.exec(`create policy ${q(p.policyname)} on ${q(p.schemaname)}.${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${roles}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''};`);}
 for(const trigger of snapshot.triggers||[])await db.exec(trigger+';');
 // Restore identity counters so new audits cannot collide with restored rows.
 for(const t of snapshot.meta)for(const c of t.columns)if(c.identity)await db.exec(`select setval(pg_get_serial_sequence(${lit(t.schema+'.'+t.name)},${lit(c.name)}),coalesce((select max(${q(c.name)}) from ${name(t)}),0)+1,false);`);
 return db;
}
export async function verifySnapshot(db,snapshot){
 for(const t of snapshot.meta){
  const actual=(await db.query(`select to_jsonb(t) row from ${name(t)} t`)).rows.map(r=>r.row);
  // Deep comparison retains nested JSON; sorting only orders records.
  assert.deepEqual(actual.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),[...snapshot.rows[t.schema+'.'+t.name]].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),t.name);
  const indexes=(await db.query('select indexdef from pg_indexes where schemaname=$1 and tablename=$2',[t.schema,t.name])).rows.map(r=>r.indexdef).sort();assert.deepEqual(indexes,[...(t.indexes||[])].sort(),t.name+' indexes');
 }
 for(const f of snapshot.functions){const got=(await db.query('select pg_get_functiondef(p.oid) definition,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2',[f.schema,f.name])).rows[0];assert.equal(got.definition,f.definition);assert.equal(got.acl,f.acl);}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const snapshot=JSON.parse(await readFile(process.argv[2],'utf8'));const db=await restoreSnapshot(snapshot);
 try{await verifySnapshot(db,snapshot);if(process.argv[3]){await db.exec(await readFile(process.argv[3],'utf8'));await db.exec(await readFile(new URL('../db/rollback-monday-readiness.sql',import.meta.url),'utf8'));await verifySnapshot(db,snapshot);}console.log('PASS: isolated restore and function rollback; rows, indexes and function ACLs match. Auth/Vault/Biogreens not modified or restored.');}finally{await db.close();}
}
