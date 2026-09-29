import test from 'node:test';import assert from 'node:assert/strict';
import {proposeWeek} from '../v2/core.js';
import {payrollReport,rateOn,attendanceAttention} from '../v2/reporting.js';
import {duePayrollMonths} from '../supabase/functions/fraid-scheduled-reports/schedule.js';
const date='2026-10-05',settings={capacity:1,scheduleConfirmed:true,hours:{1:['08:00','16:00']}},people=[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}];
const slot=(employeeId,startTime,endTime)=>({employeeId,date,startTime,endTime});
test('planner exposes uncovered half-day and fills it only with actual availability',()=>{
 const existing=[slot('a','08:00','12:00')];
 assert.deepEqual(proposeWeek(date,people,[],existing,settings).unfilled,[{date,startTime:'12:00',endTime:'16:00',missing:1}]);
 const r=proposeWeek(date,people,[slot('b','12:00','16:00')],existing,settings);
 assert.equal(r.unfilled.length,0);assert.equal(r.draft.length,1);assert.equal(r.draft[0].startTime,'12:00');assert.equal(r.draft[0].endTime,'16:00');
});
test('planner joins contiguous segments and never counts unavailable or void shifts as coverage',()=>{
 const r=proposeWeek(date,people,[slot('a','08:00','12:00'),slot('b','12:00','16:00')],[{...slot('a','08:00','16:00'),status:'void'}],settings);
 assert.equal(r.unfilled.length,0);assert.equal(r.draft.length,2);
 const two=proposeWeek(date,people,[slot('b','08:00','16:00')],[slot('a','08:00','12:00')],{...settings,capacity:2});
 assert.equal(two.draft.length,1);assert.equal(two.draft[0].endTime,'16:00');assert.deepEqual(two.unfilled,[{date,startTime:'12:00',endTime:'16:00',missing:1}]);
});
const entry=(id,date)=>({kind:'entries',id,owner_id:'a',data:{date,timeIn:'08:00',timeOut:'16:00'}});
const wage={kind:'wages',id:'a',data:{hourly:9,rates:[{effectiveFrom:'2026-08-01',hourly:5},{effectiveFrom:'2026-09-15',hourly:7},{effectiveFrom:'2026-10-01',hourly:9}]}};
test('historical payroll uses each worked day rate, including mid-month changes',()=>{
 assert.equal(payrollReport('2026-08',[people[0]],[wage,entry('a','2026-08-31')]).rows[0].amount,40);
 const r=payrollReport('2026-09',[people[0]],[wage,entry('a','2026-09-14'),entry('b','2026-09-15')]);
 assert.equal(r.rows[0].amount,96);assert.equal(r.rows[0].hourly,null);assert.equal(r.rows[0].rateSegments.length,2);assert.equal(r.needsReview,false);
 assert.equal(rateOn(wage.data,'2026-07-31'),null);assert.equal(rateOn(wage.data,'2026-09-15'),7);
});
test('undated legacy wages and uncovered past dates are explicitly incomplete',()=>{
 for(const w of [{kind:'wages',id:'a',data:{hourly:5}},wage])assert.equal(payrollReport('2026-07',[people[0]],[w,entry('a','2026-07-15')]).rows[0].amount,null);
 const flagged=entry('a','2026-08-01');flagged.data.reviewNeeded=true;assert.equal(attendanceAttention([flagged]).length,1);
});
test('scheduler catches missed day and month without historic backfill, before-hour sends or future reports',()=>{
 assert.deepEqual(duePayrollMonths('2026-09-29',12),[]);
 assert.deepEqual(duePayrollMonths('2026-10-15',7),[]);
 assert.deepEqual(duePayrollMonths('2026-10-15',8),['2026-09']);
 assert.deepEqual(duePayrollMonths('2026-10-16',8),['2026-09']);
 assert.deepEqual(duePayrollMonths('2026-11-01',8),['2026-09']);
 assert.deepEqual(duePayrollMonths('2026-11-15',8),['2026-09','2026-10']);
 assert.deepEqual(duePayrollMonths('2027-01-16',8),['2026-09','2026-10','2026-11','2026-12']);
});
