import test from 'node:test';import assert from 'node:assert/strict';import {payrollReport,previousMonth,expiryItems} from '../v2/reporting.js';
const people=[{id:'a',name:'A'},{id:'b',name:'B'}];const entry=(id,a,b)=>({kind:'entries',id,owner_id:'a',data:{date:'2026-08-01',timeIn:a,timeOut:b}});const wage={kind:'wages',id:'a',data:{hourly:6}};
test('previous payroll month handles January',()=>assert.equal(previousMonth('2026-01-15'),'2025-12'));
test('payroll totals minutes before money rounding and includes all profiles',()=>{const r=payrollReport('2026-08',people,[entry('one','08:00','09:30'),wage]);assert.equal(r.rows.length,2);assert.equal(r.rows[0].amount,9);});
test('payroll never treats missing rates or incomplete attendance as final payout',()=>{let r=payrollReport('2026-08',people,[entry('one','08:00','09:00')]);assert.equal(r.rows[0].amount,null);r=payrollReport('2026-08',people,[entry('one','08:00',null),wage]);assert.equal(r.rows[0].amount,null);assert.equal(r.rows[0].minutes,0);});
test('overlaps and pending corrections are excluded from payout',()=>{const r=payrollReport('2026-08',people,[entry('one','08:00','10:00'),entry('two','09:00','11:00'),wage]);assert.equal(r.rows[0].amount,null);assert.equal(r.rows[0].minutes,0);const q=payrollReport('2026-08',people,[entry('one','08:00','10:00'),wage,{kind:'corrections',data:{status:'pending',entryId:'one'}}]);assert.equal(q.rows[0].amount,null);});
test('expiry respects stock quantity, warning threshold and expired dates',()=>{const stock=(id,date,quantity=1)=>({kind:'stock',id,data:{expiryDate:date,quantity,expiryWarningDays:3}});const r=expiryItems([stock('past','2026-09-18'),stock('soon','2026-09-23'),stock('later','2026-09-24'),stock('empty','2026-09-20',0)],'2026-09-20');assert.deepEqual(r.map(s=>s.id),['past','soon']);});

test('a missing rate without attendance still flags the report as incomplete',()=>{
 const r=payrollReport('2026-08',people,[]);assert.equal(r.needsReview,true);assert.equal(r.rows[1].amount,null);assert.ok(r.rows[1].issues.includes('Chýba hodinovka'));
});
test('unknown profiles and void wage records cannot produce a payout',()=>{
 assert.equal(payrollReport('2026-08',[],[entry('one','08:00','09:00'),wage]).rows[0].amount,null);
 assert.equal(payrollReport('2026-08',people,[entry('one','08:00','09:00'),{...wage,data:{hourly:6,status:'void'}}]).rows[0].hourly,null);
});
test('reviewed hours match payroll and retain unresolved overlap warnings',async()=>{
 const {reviewedAttendance}=await import('../v2/reporting.js');
 const records=[entry('one','08:00','10:00'),entry('two','09:00','11:00'),entry('three','12:00','13:30'),wage,{kind:'corrections',data:{status:'pending',entryId:'one'}}];
 const a=reviewedAttendance('2026-08',records),p=payrollReport('2026-08',people,records);
 assert.equal(a.totalMinutes,90);assert.equal(p.totalMinutes,a.totalMinutes);assert.ok(a.rows.find(r=>r.id==='two').issues.includes('prekrývajúce sa záznamy'));
});
test('invalid dates, invalid times and review flags are excluded without NaN totals',async()=>{
 const {reviewedAttendance}=await import('../v2/reporting.js');
 const invalid=entry('one','08:00','16:00');invalid.data.date='2026-02-30';
 assert.equal(reviewedAttendance('2026-02',[invalid]).totalMinutes,0);
 const flagged=entry('flagged','08:00','16:00');flagged.data.reviewNeeded=true;
 const r=reviewedAttendance('2026-08',[flagged,entry('bad','99:00','16:00')]);assert.equal(r.totalMinutes,0);assert.equal(r.needsReview,true);
});
test('separate employees and adjoining shifts do not create false overlaps',async()=>{
 const {reviewedAttendance}=await import('../v2/reporting.js');
 const other={...entry('other','08:00','10:00'),owner_id:'b'};
 const r=reviewedAttendance('2026-08',[entry('one','08:00','10:00'),entry('two','10:00','11:00'),other]);assert.equal(r.totalMinutes,300);assert.equal(r.needsReview,false);
});
test('frontend and scheduled report calculations stay identical',async()=>{
 const edge=await import('../supabase/functions/fraid-scheduled-reports/reporting.js');
 assert.deepEqual(edge.payrollReport('2026-08',people,[entry('one','08:00','09:00'),wage]),payrollReport('2026-08',people,[entry('one','08:00','09:00'),wage]));
});
