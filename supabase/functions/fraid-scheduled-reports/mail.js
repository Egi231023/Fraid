export function payrollHtml(report,{test=false}={}) {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>Number(v).toFixed(2).replace('.',',');
 const cell='padding:12px 6px;border-bottom:1px solid #e6e0d8;vertical-align:top;';
 const rows=report.rows.map((r,i)=>`<tr><th scope="row" style="${cell}text-align:left;font-weight:600;overflow-wrap:anywhere;">${esc(r.name)}${r.issues.length?` <sup style="color:#80501b;">[${i+1}]</sup>`:''}</th><td style="${cell}text-align:right;white-space:nowrap;">${number(r.hours)}</td><td style="${cell}text-align:right;white-space:nowrap;">${r.hourly===null?'—':number(r.hourly)+' €'}</td><td style="${cell}text-align:right;">${r.amount===null?'<span style="color:#80501b;">Na kontrolu</span>':number(r.amount)+' €'}</td></tr>`).join('');
 const notes=report.rows.flatMap((r,i)=>{
  if(!r.issues.length)return [];
  const counts=new Map();for(const issue of r.issues)counts.set(issue,(counts.get(issue)||0)+1);
  return [`<li style="margin-bottom:12px;"><strong>[${i+1}] ${esc(r.name)}</strong><br>${[...counts].map(([issue,n])=>esc(issue)+(n>1?` (${n}×)`:'')).join('<br>')}</li>`];
 }).join('');
 return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px 8px;background:#f5f2ed;color:#29221d;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:640px;margin:0 auto;padding:20px 12px;background:#ffffff;border:1px solid #e6e0d8;border-radius:12px;"><p style="margin:0 0 8px;color:#755d49;font-size:12px;letter-spacing:2px;">FRAID COFFEE</p><h1 style="margin:0 0 6px;font-size:24px;">Výkaz hodín</h1><p style="margin:0 0 20px;color:#66594e;">Obdobie ${esc(report.month)}</p>${test?'<p style="padding:12px;background:#fff4df;color:#80501b;">Skúšobný výkaz · nejde o potvrdenie vyplatenia.</p>':''}<table aria-label="Prehľad hodín a orientačných súm" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;line-height:1.45;"><thead><tr style="background:#f0ebe4;"><th scope="col" style="padding:10px 6px;width:31%;text-align:left;">Meno</th><th scope="col" style="padding:10px 6px;width:19%;text-align:right;">Hodiny</th><th scope="col" style="padding:10px 6px;width:23%;text-align:right;">Sadzba/h</th><th scope="col" style="padding:10px 6px;width:27%;text-align:right;">Suma</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:12px;color:#66594e;">Započítané sú iba overené hodiny. Sadzby sú aktuálne uložené hodinovky; sumy sú orientačné.</p><div style="padding:14px;background:#f0ebe4;"><strong>Súčet vypočítateľných súm: ${number(report.knownAmount)} €</strong>${report.needsReview?'<br><span style="font-size:13px;color:#80501b;">Neúplný súčet — niektoré záznamy vyžadujú kontrolu.</span>':''}</div>${notes?`<h2 style="font-size:17px;margin-top:24px;">Na kontrolu</h2><ul style="padding-left:20px;font-size:13px;line-height:1.6;">${notes}</ul>`:''}<p style="font-size:12px;line-height:1.6;color:#66594e;">${esc(report.rateNote)}</p><p style="font-size:13px;">Tabuľka vo formáte CSV je aj v prílohe.</p><p><a href="https://egi231023.github.io/Fraid/v2/" style="color:#61472f;">Otvoriť Fraid</a></p></div></body></html>`;
}
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
