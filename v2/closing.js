export function closingChecklist(records,date){
 const tasks=records.filter(r=>r.kind==='templates'&&r.data.period==='evening'&&r.data.status==='approved');
 const completed=new Set(records.filter(r=>r.kind==='checks'&&r.data.date===date&&r.data.status!=='void').map(r=>r.data.templateId));
 const missing=tasks.filter(t=>!completed.has(t.id));
 return {total:tasks.length,done:tasks.length-missing.length,missing:missing.map(t=>t.data.title)};
}
