import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/database.mjs';
import {reviewedAttendance,attendanceAttention,payrollReport} from '../v2/reporting.js';
const correction={entryId:'entry',timeIn:'08:00',timeOut:'16:00',reason:'Verified with worker'};
test('baseline reproduces review flag defect; migration fixes direct and requested corrections with audit',async()=>{
 for(const patched of [false,true]){
  const f=await database({patched});try{
   await f.seedEntry('entry',{reviewNeeded:true});await f.actor('admin');
   const old=(await f.records()).find(r=>r.id==='entry');
   const fixed=await f.write({op:'save',kind:'entries',id:'entry',version:1,reason:'Verified departure',data:{...old.data,timeOut:'16:00'}});
   assert.equal(reviewedAttendance('2026-09',[fixed]).totalMinutes,patched?480:0);
   assert.equal(attendanceAttention([fixed]).length,patched?0:1);
   if(patched){await f.seedEntry('requested',{reviewNeeded:true});await f.actor('employee');const req=await f.write({op:'save',kind:'corrections',id:'request',version:0,data:{...correction,entryId:'requested'}});await f.actor('admin');await f.write({op:'approve_correction',kind:'corrections',id:'request',version:req.version,data:req.data});const records=await f.records();assert.equal(records.find(r=>r.id==='requested').data.reviewNeeded,false);assert.equal(reviewedAttendance('2026-09',records).totalMinutes,0,'overlap remains excluded');const audits=(await f.db.query("select action from public.fraid_v2_audit where record_id='requested'")).rows;assert.ok(audits.some(x=>x.action==='correction'));}
  }finally{await f.close();}
 }
});
test('pending uniqueness, withdrawal, rejection, stale versions and idempotent resolution',async()=>{
 const f=await database();try{
  await f.seedEntry('entry',{});await f.actor('employee');
  const c=await f.write({op:'save',kind:'corrections',id:'c1',version:0,data:correction});
  await assert.rejects(()=>f.write({op:'save',kind:'corrections',id:'c2',version:0,data:correction}),/už čaká/);
  await assert.rejects(()=>f.write({op:'reject_correction',kind:'corrections',id:'c1',version:1,reason:'Not permitted',data:c.data}),/administrátor/);
  await f.write({op:'withdraw_correction',kind:'corrections',id:'c1',version:1,reason:'Wrong time',data:c.data});
  await f.write({op:'save',kind:'corrections',id:'c2',version:0,data:correction});await f.actor('admin');
  await assert.rejects(()=>f.write({op:'withdraw_correction',kind:'corrections',id:'c2',version:1,reason:'Not owner',data:correction}),/vlastnú/);
  const payload={op:'reject_correction',kind:'corrections',id:'c2',version:1,reason:'Clarification required',data:correction,requestId:crypto.randomUUID()};
  assert.deepEqual(await f.write(payload),await f.write(payload));
  await assert.rejects(()=>f.write({...payload,requestId:crypto.randomUUID()}),/zmenil|vybavená/);
  await f.actor('outsider');await assert.rejects(()=>f.write({op:'clock',data:{action:'in'}}),/schválený/);assert.equal((await f.records()).length,0);
  await f.actor('anon');await assert.rejects(()=>f.write({op:'clock',data:{action:'in'}}),/permission denied/);
 }finally{await f.close();}
});
test('admin edit supersedes pending requests and cannot approve stale copies or own conflicting hours',async()=>{
 const f=await database();try{
  await f.seedEntry('entry',{reviewNeeded:true});await f.actor('employee');const c=await f.write({op:'save',kind:'corrections',id:'c',version:0,data:correction});
  await f.actor('admin');const entry=(await f.records()).find(r=>r.id==='entry');
  await f.write({op:'save',kind:'entries',id:'entry',version:entry.version,reason:'Confirmed actual departure',data:{...entry.data,timeOut:'16:00'}});
  const records=await f.records();assert.equal(records.find(r=>r.id==='c').data.status,'superseded');assert.equal(reviewedAttendance('2026-09',records).totalMinutes,480);
  await assert.rejects(()=>f.write({op:'approve_correction',kind:'corrections',id:'c',version:c.version,data:c.data}),/zmenil/);
 }finally{await f.close();}
});
test('dated wage writes validate ownership, immutable past intervals and explicit correction of same effective day',async()=>{
 const f=await database();try{
  await f.actor('employee');const op={op:'save',kind:'wages',id:'employee',version:0,reason:'Confirmed agreement',data:{employeeId:'employee',hourly:5,effectiveFrom:'2026-08-01'}};
  await assert.rejects(()=>f.write(op),/administrátor/);await f.actor('admin');
  const first=await f.write(op);const second=await f.write({...op,version:first.version,data:{...op.data,hourly:7,effectiveFrom:'2026-09-01'}});
  assert.equal(second.data.rates.length,2);assert.equal(second.data.rates[0].hourly,5);
  await assert.rejects(()=>f.write({...op,version:second.version,data:{...op.data,hourly:8,effectiveFrom:'2026-09-01'}}),/už existuje/);
  const third=await f.write({...op,version:second.version,data:{...op.data,hourly:8,effectiveFrom:'2026-09-01',replaceExisting:true}});assert.equal(third.data.rates.length,2);
  await assert.rejects(()=>f.write({...op,version:third.version,data:{...op.data,effectiveFrom:null}}),/dátum/);
  await assert.rejects(()=>f.write({...op,version:third.version,data:{...op.data,rates:[],employeeId:'admin'}}),/profil/);
  const es={kind:'entries',id:'aug',owner_id:'employee',data:{date:'2026-08-20',timeIn:'08:00',timeOut:'16:00'}};
  assert.equal(payrollReport('2026-08',[{id:'employee',name:'Synthetic'}],[es,third]).rows[0].amount,40);
 }finally{await f.close();}
});
