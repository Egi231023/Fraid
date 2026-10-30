// Display only. Stored clocks have minute precision: :02 rounds down, :03 up.
// Nearest 5 minutes has a mathematical half-up boundary at 2m30s, but this
// helper accepts HH:MM only; it never invents seconds or uses event timestamps.
// Never import this helper into payroll/reporting or authoritative CSV export.
export function attendanceDisplayTime(value) {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value||''))return '—';
 const minute=Number(value.slice(0,2))*60+Number(value.slice(3));
 const rounded=Math.floor((minute+2.5)/5)*5;
 const clock=rounded%1440;
 return `${String(Math.floor(clock/60)).padStart(2,'0')}:${String(clock%60).padStart(2,'0')}${rounded>=1440?' (+1 deň)':''}`;
}
