// Calendar-only calculations. Planned shifts never change attendance or payroll.
export function monthDates(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Neplatný mesiac.');
  const start = new Date(month + '-01T12:00:00Z');
  const dates = [];
  for (let date = start; date.toISOString().slice(0, 7) === month; date = new Date(date.getTime() + 86400000)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function moveMonth(month, direction) {
  monthDates(month);
  const date = new Date(month + '-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 7);
}

export function scheduleRows(month, people, shifts) {
  monthDates(month);
  const selected = shifts.filter(shift => shift.date?.startsWith(month + '-') && shift.status !== 'void');
  const ids = new Set([...people.filter(person => person.active).map(person => person.id), ...selected.map(shift => shift.employeeId)]);
  return [...ids].map(id => ({
    person: people.find(person => person.id === id) || {id, name:'Pôvodný profil', active:false},
    shifts: selected.filter(shift => shift.employeeId === id).sort((a,b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
  })).sort((a,b) => a.person.name.localeCompare(b.person.name, 'sk'));
}
