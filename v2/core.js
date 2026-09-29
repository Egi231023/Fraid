export const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const today = (date=new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const money = n => new Intl.NumberFormat('sk-SK',{style:'currency',currency:'EUR'}).format(Number(n)||0);
export const minutes = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s||'') ? Number(s.slice(0,2))*60+Number(s.slice(3)) : NaN;
export const hours = d => d.status==='void'||!d.timeOut ? 0 : Math.max(0,minutes(d.timeOut)-minutes(d.timeIn))/60;
export const number = v => { const s=String(v).trim().replace(',','.'); if(!/^-?\d+(\.\d+)?$/.test(s)||!Number.isFinite(Number(s)))throw Error('Zadaj platné číslo.'); return Number(s); };
export function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekStart(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7));}
export function recipeCost(recipe,stock){let sum=0;for(const i of recipe.ingredients||[]){const item=stock.find(s=>s.id===i.stockId);if(!item||item.unitCost==null||String(item.unitCost).trim()===''||!Number.isFinite(Number(item.unitCost))||Number(item.unitCost)<0)return null;const scales={g:['mass',1],kg:['mass',1000],ml:['volume',1],l:['volume',1000],ks:['count',1]};const a=scales[i.unit],b=scales[item.unit];if(!a||!b||a[0]!==b[0]||!(Number(i.quantity)>0)||!Number.isFinite(Number(i.quantity)))return null;sum+=Number(i.quantity)*a[1]/b[1]*Number(item.unitCost);}return recipe.ingredients?.length?sum:null;}
export function proposeWeek(start,people,availability,shifts,settings){
 if(!settings.scheduleConfirmed)throw Error('Najprv potvrď otváracie časy a kapacitu v nastaveniach.');
 if(!Number.isInteger(settings.capacity)||settings.capacity<1||settings.capacity>20)throw Error('Neplatná kapacita prevádzky.');
 const draft=[],unfilled=[],load=Object.fromEntries(people.map(p=>[p.id,0]));
 const valid=s=>Number.isFinite(minutes(s.startTime))&&Number.isFinite(minutes(s.endTime))&&s.startTime<s.endTime;
 const active=shifts.filter(s=>s.status!=='void'&&valid(s));
 for(const s of active)if(s.date>=start&&s.date<=addDays(start,6))load[s.employeeId]=(load[s.employeeId]||0)+(minutes(s.endTime)-minutes(s.startTime))/60;
 for(let n=0;n<7;n++){
  const date=addDays(start,n),dow=new Date(date+'T12:00Z').getUTCDay(),times=settings.hours?.[dow];if(!times)continue;
  const [a,b]=times;if(!Number.isFinite(minutes(a))||!Number.isFinite(minutes(b))||a>=b)throw Error('Neplatné otváracie časy.');
  const existing=active.filter(s=>s.date===date&&s.startTime<b&&s.endTime>a);
  const available=availability.filter(v=>v.date===date&&v.status!=='void'&&valid(v));
  const bounds=[...new Set([a,b,...[...existing,...available].flatMap(s=>[s.startTime,s.endTime]).filter(t=>t>a&&t<b)])].sort();
  for(let i=0;i<bounds.length-1;i++){
   const from=bounds[i],to=bounds[i+1],working=existing.filter(s=>s.startTime<to&&s.endTime>from);
   let missing=Math.max(0,settings.capacity-working.length);const used=new Set(working.map(s=>s.employeeId));
   while(missing>0){
    const choices=people.filter(p=>p.active&&!used.has(p.id)&&available.some(v=>v.employeeId===p.id&&v.startTime<=from&&v.endTime>=to)).sort((x,y)=>(load[x.id]||0)-(load[y.id]||0)||x.name.localeCompare(y.name,'sk'));
    if(!choices.length)break;
    const p=choices[0],previous=draft.find(s=>s.employeeId===p.id&&s.date===date&&s.endTime===from);
    if(previous)previous.endTime=to;else draft.push({employeeId:p.id,date,startTime:from,endTime:to,status:'draft'});
    used.add(p.id);load[p.id]+=(minutes(to)-minutes(from))/60;missing--;
   }
   if(missing){const prev=unfilled.at(-1);if(prev?.date===date&&prev.endTime===from&&prev.missing===missing)prev.endTime=to;else unfilled.push({date,startTime:from,endTime:to,missing});}
  }
 }
 return {draft,unfilled};
}
export function csv(rows){const cell=x=>{let s=String(x??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');}
