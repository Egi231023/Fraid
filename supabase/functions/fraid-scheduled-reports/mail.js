export function payrollCsv(report) {
 const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const rows=[['Meno','Hodiny','Aktuálna hodinovka EUR','Orientačná suma EUR','Na kontrolu'],...report.rows.map(r=>[r.name,r.hours.toFixed(2),r.hourly??'',r.amount??'',r.issues.join('; ')]),['Súčet vypočítateľných súm','','',report.knownAmount,report.needsReview?'Neúplný – vyžaduje kontrolu':''],['Poznámka',report.rateNote]];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
export function attachment(report){
 const bytes=new TextEncoder().encode(payrollCsv(report));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {filename:`fraid-hodiny-${report.month}.csv`,content:btoa(binary),content_type:'text/csv; charset=utf-8'};
}
export async function submitMail(payload,key,apiKey,transport=fetch){
 try{
  const res=await transport('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':'fraid-'+key},body:JSON.stringify(payload)});
  const result=await res.json();const ok=res.ok&&typeof result.id==='string'&&result.id.length>0;
  return {ok,providerId:ok?result.id:null,error:ok?null:`Email provider HTTP ${res.status}`,state:ok?'accepted':'failed'};
 }catch{return {ok:false,providerId:null,error:'Email transport failure',state:'failed'};}
}
