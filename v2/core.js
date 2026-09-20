export const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const today = (date=new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const money = n => new Intl.NumberFormat('sk-SK',{style:'currency',currency:'EUR'}).format(Number(n)||0);
export const minutes = s => /^\d\d:\d\d$/.test(s||'') ? Number(s.slice(0,2))*60+Number(s.slice(3)) : NaN;
export const hours = d => d.status==='void'||!d.timeOut ? 0 : Math.max(0,minutes(d.timeOut)-minutes(d.timeIn))/60;
export const number = v => { const s=String(v).trim().replace(',','.'); if(!/^-?\d+(\.\d+)?$/.test(s)||!Number.isFinite(Number(s)))throw Error('Zadaj platné číslo.'); return Number(s); };
export function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekStart(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7));}
export function recipeCost(recipe,stock){let sum=0;for(const i of recipe.ingredients||[]){const item=stock.find(s=>s.id===i.stockId);if(!item||item.unitCost==null||item.unitCost==='')return null;const scales={g:['mass',1],kg:['mass',1000],ml:['volume',1],l:['volume',1000],ks:['count',1]};const a=scales[i.unit],b=scales[item.unit];if(!a||!b||a[0]!==b[0]||!(Number(i.quantity)>0))return null;sum+=Number(i.quantity)*a[1]/b[1]*Number(item.unitCost);}return recipe.ingredients?.length?sum:null;}
export function proposeWeek(start,people,availability,shifts,settings){
 if(!settings.scheduleConfirmed)throw Error('Najprv potvrď otváracie časy a kapacitu v nastaveniach.');
 const draft=[],unfilled=[],load=Object.fromEntries(people.map(p=>[p.id,0]));
 for(const s of shifts)if(s.date>=start&&s.date<=addDays(start,6)&&s.status!=='void')load[s.employeeId]=(load[s.employeeId]||0)+(minutes(s.endTime)-minutes(s.startTime))/60;
 for(let n=0;n<7;n++){const date=addDays(start,n),dow=new Date(date+'T12:00Z').getUTCDay(),times=settings.hours?.[dow];if(!times)continue;const [a,b]=times;
  const existing=shifts.filter(s=>s.date===date&&s.status!=='void'&&s.startTime<b&&s.endTime>a);
  // Conservatively reserve a slot for every existing overlapping shift. Never exceed capacity.
  for(let slot=existing.length;slot<settings.capacity;slot++){
   const choices=people.filter(p=>p.active&&availability.some(v=>v.employeeId===p.id&&v.date===date&&v.startTime<=a&&v.endTime>=b)&&![...existing,...draft.filter(x=>x.date===date)].some(s=>s.employeeId===p.id&&s.startTime<b&&s.endTime>a)).sort((x,y)=>(load[x.id]||0)-(load[y.id]||0)||x.name.localeCompare(y.name,'sk'));
   if(!choices.length){unfilled.push(date);continue;}const p=choices[0];draft.push({employeeId:p.id,date,startTime:a,endTime:b,status:'draft'});load[p.id]+=(minutes(b)-minutes(a))/60;
  }
 }return {draft,unfilled};
}
export function csv(rows){const cell=x=>{let s=String(x??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');}
