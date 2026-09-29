import {previousMonth} from './reporting.js';

// Start with September payroll, first due 15 October 2026. Never backfill
// unrequested historic reports merely because catch-up was deployed.
export const FIRST_PAYROLL_MONTH='2026-09';
export function duePayrollMonths(day,hour,{mail_day=15,local_hour=8}={},first=FIRST_PAYROLL_MONTH){
 if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(day)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(first))throw Error('Invalid scheduler date');
 if(hour<local_hour)return [];
 const latest=Number(day.slice(8))>=mail_day?previousMonth(day):previousMonth(previousMonth(day)+'-01');
 const months=[];
 for(let month=first;month<=latest;){
  months.push(month);const [year,n]=month.split('-').map(Number);
  month=`${n===12?year+1:year}-${String(n===12?1:n+1).padStart(2,'0')}`;
 }
 return months;
}
