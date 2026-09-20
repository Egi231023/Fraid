// Offline-only scheduler restore drill. Never connects to a remote database.
// This is NOT a full Supabase project restore (Auth, Storage, Vault excluded).
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const file=process.argv[2];
if(!file)throw Error('Pass the private scheduler snapshot JSON path');
const s=JSON.parse(await readFile(file,'utf8'));
const ident=v=>'"'+v.replaceAll('"','""')+'"';
const literal=v=>"'"+v.replaceAll("'","''")+"'";
assert.equal(s.policies.length,0,'Unexpected policies: extend restore before proceeding');
let sql='CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA fraid_private;\n';
sql+='REVOKE ALL ON SCHEMA fraid_private FROM PUBLIC; GRANT USAGE ON SCHEMA fraid_private TO authenticated,service_role;\n';
for(const t of s.tables){
 assert.equal(t.owner,'postgres');assert.equal(t.acl,'{postgres=arwdDxtm/postgres}');
 const table='fraid_private.'+ident(t.name);
 sql+=`CREATE TABLE ${table} (${t.columns.map(c=>ident(c.name)+' '+c.type+(c.default?' DEFAULT '+c.default:'')+(c.not_null?' NOT NULL':'')).concat(t.constraints.map(c=>'CONSTRAINT '+ident(c.name)+' '+c.definition)).join(',')});\n`;
 sql+=`REVOKE ALL ON ${table} FROM PUBLIC,anon,authenticated,service_role;\n`;
 if(t.rls)sql+=`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n`;
 if(t.force_rls)sql+=`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;\n`;
 sql+=`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(null::${table},${literal(JSON.stringify(s.rows[t.name]))}::jsonb);\n`;
}
for(const f of [...s.functions].sort((a,b)=>(a.schema==='public')-(b.schema==='public'))){
 assert.equal(f.owner,'postgres');
 sql+=f.definition+';\n';
 const signature=ident(f.schema)+'.'+ident(f.name)+'('+f.signature+')';
 sql+=`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC,anon,authenticated,service_role;\n`;
 for(const role of ['authenticated','service_role'])if(f.acl.includes(role+'=X/'))sql+=`GRANT EXECUTE ON FUNCTION ${signature} TO ${role};\n`;
}
await writeFile(file.replace(/\.json$/,'.restore.sql'),sql,{mode:0o600});
const db=new PGlite();
await db.exec(sql);
if(process.argv[3]){
 await db.exec(await readFile(process.argv[3],'utf8'));
 const ready=(await db.query("select fraid_private.job_control('{\"action\":\"smtp_ready\"}') as result")).rows[0].result;
 assert.equal(ready.ready,true);
 // Restore the backed-up function after applying the proposed migration locally.
 await db.exec(s.functions.find(f=>f.schema==='fraid_private'&&f.name==='job_control').definition);
}
for(const t of s.tables){
 const actual=(await db.query(`SELECT to_jsonb(t) AS row FROM fraid_private.${ident(t.name)} t`)).rows.map(r=>r.row);
 assert.deepEqual(actual,s.rows[t.name]);
 const indexes=(await db.query('select indexdef from pg_indexes where schemaname=$1 and tablename=$2',['fraid_private',t.name])).rows.map(r=>r.indexdef).sort();
 assert.deepEqual(indexes,t.indexes.sort());
}
for(const f of s.functions){
 const actual=(await db.query('select pg_get_functiondef(p.oid) as definition,p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2',[f.schema,f.name])).rows[0];
 assert.equal(actual.definition,f.definition);assert.equal(actual.acl,f.acl);
}
await db.exec('SET ROLE anon');
await assert.rejects(()=>db.query("select public.fraid_job_control('{\"action\":\"config\"}')"),/permission denied/);
await db.exec('RESET ROLE; SET ROLE service_role');
const config=(await db.query("select public.fraid_job_control('{\"action\":\"config\"}') as c")).rows[0].c;
assert.deepEqual(config,s.rows.job_config[0]);
await db.exec('RESET ROLE');
await db.close();
console.log('PASS: scheduler rows, indexes, function definitions/ACLs, anonymous denial and service-role config restored in isolated PGlite.');
console.log('LIMITATION: not a full project restore; external Vault/Auth/net dependencies not executed.');
