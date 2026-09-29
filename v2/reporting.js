export function previousMonth(day){const [y,m]=day.slice(0,7).split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;}
const time=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):null;
export function reviewedAttendance(month,records){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Neplatný mesiac.');
 const pending=new Set(records.filter(r=>r.kind==='corrections'&&r.data.status==='pending').map(r=>r.data.entryId));
 const rows=records.filter(r=>r.kind==='entries'&&r.data.status!=='void'&&r.data.date?.startsWith(month+'-')).map(r=>{
  const d=r.data,a=time(d.timeIn),b=time(d.timeOut),issues=[];
  const dateValid=/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&!Number.isNaN(Date.parse(d.date+'T12:00:00Z'))&&new Date(d.date+'T12:00:00Z').toISOString().slice(0,10)===d.date;
  if(!dateValid)issues.push('neplatný dátum');
  if(pending.has(r.id))issues.push('čaká oprava');
  if(!d.timeOut)issues.push('chýba odchod');
  else if(a===null||b===null||b<=a)issues.push('časy vyžadujú kontrolu');
  if(d.reviewNeeded)issues.push('záznam vyžaduje kontrolu');
  if(r.owner_id&&d.employeeId&&r.owner_id!==d.employeeId)issues.push('nesúlad priradenia profilu');
  return {id:r.id,ownerId:r.owner_id||d.employeeId,date:d.date,timeIn:d.timeIn,timeOut:d.timeOut,a,b,dateValid,issues,minutes:0};
 });
 // Even a pending correction can overlap another entry. Neither is verified until resolved.
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];
  if(a.ownerId===b.ownerId&&a.date===b.date&&a.dateValid&&b.dateValid&&a.a!==null&&a.b!==null&&b.a!==null&&b.b!==null&&a.b>a.a&&b.b>b.a&&a.a<b.b&&b.a<a.b){
   for(const r of [a,b])if(!r.issues.includes('prekrývajúce sa záznamy'))r.issues.push('prekrývajúce sa záznamy');
  }
 }
 for(const r of rows)if(!r.issues.length)r.minutes=r.b-r.a;
 return {rows,totalMinutes:rows.reduce((n,r)=>n+r.minutes,0),needsReview:rows.some(r=>r.issues.length)};
}
export function rateOn(wage,date){
 if(!wage||wage.status==='void')return null;
 const rates=Array.isArray(wage.rates)?wage.rates:[];
 const applicable=rates.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom||'')&&r.effectiveFrom<=date).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom));
 const first=applicable[0];if(!first||applicable[1]?.effectiveFrom===first.effectiveFrom)return null;
 const value=first.hourly;if(value===null||value===undefined||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0)return null;
 return Number(value);
}
export function attendanceAttention(records){
 const months=[...new Set(records.filter(r=>r.kind==='entries'&&r.data.status!=='void'&&r.data.date).map(r=>r.data.date.slice(0,7)))].filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m));
 return months.flatMap(m=>reviewedAttendance(m,records).rows).filter(r=>r.issues.length);
}
export function payrollReport(month,people,records){
 const attendance=reviewedAttendance(month,records);
 const ids=new Set([...people.map(p=>p.id),...attendance.rows.map(r=>r.ownerId)]);
 const rows=[...ids].map(id=>{
  const p=people.find(p=>p.id===id),es=attendance.rows.filter(r=>r.ownerId===id),issues=es.flatMap(r=>r.issues.map(issue=>`${r.date}: ${issue}`));
  if(!p)issues.push('Nepriradený profil');
  const minutes=es.reduce((n,r)=>n+r.minutes,0),wage=records.find(r=>r.kind==='wages'&&r.id===id&&r.data.status!=='void')?.data;
  const segments=new Map();let amount=0;
  for(const e of es){const hourly=rateOn(wage,e.date);if(hourly===null){issues.push(`${e.date}: Chýba potvrdená hodinovka platná v tento deň`);continue;}if(e.issues.length)continue;segments.set(hourly,(segments.get(hourly)||0)+e.minutes);amount+=e.minutes/60*hourly;}
  const lastDay=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const fallback=rateOn(wage,month+'-'+String(lastDay).padStart(2,'0'));
  if(!es.length&&fallback===null)issues.push(wage?'Chýba potvrdená platnosť hodinovky':'Chýba hodinovka');
  const rateSegments=[...segments].map(([hourly,minutes])=>({hourly,minutes}));
  const hourly=rateSegments.length===1?rateSegments[0].hourly:rateSegments.length?null:fallback;
  const rateLabel=rateSegments.length>1?rateSegments.map(r=>`${r.hourly.toFixed(2)} €/h (${(r.minutes/60).toFixed(2)} h)`).join('; '):hourly===null?'Nezadaná platnosť':hourly.toFixed(2)+' €/h';
  return {id,name:p?.name||'Nepriradený profil',minutes,hours:minutes/60,hourly,rateLabel,rateSegments,amount:issues.length?null:Math.round((amount+Number.EPSILON)*100)/100,issues:[...new Set(issues)],entries:es.length};
 }).sort((a,b)=>a.name.localeCompare(b.name,'sk'));
 return {month,rows,totalMinutes:attendance.totalMinutes,knownAmount:Math.round(rows.reduce((n,r)=>n+(r.amount??0),0)*100)/100,needsReview:rows.some(r=>r.issues.length),rateNote:'Výpočet používa potvrdenú sadzbu platnú v deň dochádzky. Chýbajúcu historickú platnosť musí potvrdiť administrátor. Nejde o potvrdenie vyplatenia ani výpočet odvodov.'};
}
export function expiryItems(records,day){return records.filter(r=>r.kind==='stock'&&r.data.status!=='void'&&Number(r.data.quantity)>0&&/^\d{4}-\d{2}-\d{2}$/.test(r.data.expiryDate||'')).map(r=>({...r.data,id:r.id,days:Math.round((Date.parse(r.data.expiryDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000)})).filter(s=>Number.isFinite(s.days)&&s.days<=Number(s.expiryWarningDays??3)).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));}
export function payrollText(report){return [`Fraid – výkaz hodín ${report.month}`,'',...report.rows.map(r=>`${r.name}: ${r.hours.toFixed(2)} h | ${r.rateLabel} | ${r.amount===null?'NA KONTROLU':r.amount.toFixed(2)+' €'}${r.issues.length?' | '+r.issues.join('; '):''}`),'',`Súčet vypočítateľných súm: ${report.knownAmount.toFixed(2)} €${report.needsReview?' (neúplný – pozri záznamy na kontrolu)':''}`,report.rateNote,'Otvor aplikáciu: https://egi231023.github.io/Fraid/'].join('\n');}
