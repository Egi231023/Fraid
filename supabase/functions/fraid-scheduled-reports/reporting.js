export function previousMonth(day){const [y,m]=day.slice(0,7).split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;}
const time=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
export function payrollReport(month,people,records){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Neplatný mesiac.');
 const pending=new Set(records.filter(r=>r.kind==='corrections'&&r.data.status==='pending').map(r=>r.data.entryId));
 const entries=records.filter(r=>r.kind==='entries'&&r.data.status!=='void'&&r.data.date?.startsWith(month+'-'));
 const ids=new Set([...people.map(p=>p.id),...entries.map(r=>r.owner_id||r.data.employeeId)]);
 const rows=[...ids].map(id=>{
  const p=people.find(p=>p.id===id),es=entries.filter(r=>(r.owner_id||r.data.employeeId)===id),issues=[],valid=[];
  for(const r of es){const d=r.data,a=time(d.timeIn),b=time(d.timeOut);if(a===null||b===null||b<=a||d.reviewNeeded||pending.has(r.id)){issues.push(`${d.date}: ${pending.has(r.id)?'čaká oprava':!d.timeOut?'chýba odchod':'časy vyžadujú kontrolu'}`);continue;}valid.push({id:r.id,date:d.date,a,b});}
  const overlaps=new Set();for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++)if(valid[i].date===valid[j].date&&valid[i].a<valid[j].b&&valid[j].a<valid[i].b){overlaps.add(valid[i].id);overlaps.add(valid[j].id);}
  if(overlaps.size)issues.push(`${overlaps.size} prekrývajúce sa záznamy nezapočítané`);
  const minutes=valid.filter(r=>!overlaps.has(r.id)).reduce((n,r)=>n+r.b-r.a,0),raw=records.find(r=>r.kind==='wages'&&r.id===id)?.data.hourly;
  const hourly=raw===null||raw===undefined||String(raw).trim()===''||!Number.isFinite(Number(raw))||Number(raw)<0?null:Number(raw);
  if(hourly===null&&es.length)issues.push('Chýba hodinovka');
  return {id,name:p?.name||'Nepriradený profil',minutes,hours:minutes/60,hourly,amount:issues.length||hourly===null?null:Math.round(minutes/60*hourly*100)/100,issues,entries:es.length};
 }).sort((a,b)=>a.name.localeCompare(b.name,'sk'));
 return {month,rows,totalMinutes:rows.reduce((n,r)=>n+r.minutes,0),knownAmount:Math.round(rows.reduce((n,r)=>n+(r.amount??0),0)*100)/100,needsReview:rows.some(r=>r.issues.length),rateNote:'Výpočet používa aktuálne uložené hodinovky. Nie je to potvrdenie vyplatenia ani výpočet odvodov. Pri zmene sadzby skontroluj jej platnosť pre tento mesiac.'};
}
export function expiryItems(records,day){return records.filter(r=>r.kind==='stock'&&r.data.status!=='void'&&Number(r.data.quantity)>0&&/^\d{4}-\d{2}-\d{2}$/.test(r.data.expiryDate||'')).map(r=>({...r.data,id:r.id,days:Math.round((Date.parse(r.data.expiryDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000)})).filter(s=>Number.isFinite(s.days)&&s.days<=Number(s.expiryWarningDays??3)).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));}
export function payrollText(report){return [`Fraid – výkaz hodín ${report.month}`,'',...report.rows.map(r=>`${r.name}: ${r.hours.toFixed(2)} h | ${r.hourly===null?'hodinovka chýba':r.hourly.toFixed(2)+' €/h'} | ${r.amount===null?'NA KONTROLU':r.amount.toFixed(2)+' €'}${r.issues.length?' | '+r.issues.join('; '):''}`),'',`Súčet vypočítateľných súm: ${report.knownAmount.toFixed(2)} €${report.needsReview?' (neúplný – pozri záznamy na kontrolu)':''}`,report.rateNote,'Otvor aplikáciu: https://egi231023.github.io/Fraid/'].join('\n');}
