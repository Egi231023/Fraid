import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import {previousMonth,payrollReport,payrollText,expiryItems} from './reporting.js';
import {sendOne} from './webpush.ts';
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
 const token=req.headers.get('X-Fraid-Job');if(!token)return json({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const control=async(p:unknown)=>{const r=await db.rpc('fraid_job_control',{p});if(r.error)throw Error('Scheduler storage error');return r.data;};
 if(!(await control({action:'authorize',token}))?.authorized)return json({error:'Unauthorized'},401);
 const input=await req.json(),config=await control({action:'config'});if(!config)return json({error:'Recipient configuration missing'},503);
 const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FRAID_MAIL_FROM'),pub=Deno.env.get('VAPID_PUBLIC_KEY'),priv=Deno.env.get('VAPID_PRIVATE_KEY');
 const health={mailConfigured:!!(apiKey&&from),pushConfigured:!!(pub&&priv)};await control({action:'health',details:health});
 if(input.dryrun)return json({...health,dryrun:true});
 const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const day=`${parts.year}-${parts.month}-${parts.day}`;if(Number(parts.hour)<config.local_hour)return json({waiting:true});
 const all=async(table:string)=>{const out:any[]=[];for(let start=0;;start+=1000){const {data,error}=await db.from(table).select('*').range(start,start+999);if(error)throw Error('Report data unavailable');out.push(...data);if(data.length<1000)break;}return out;};
 const [people,records]=await Promise.all([all('fraid_v2_people'),all('fraid_v2_records')]);
 let mail='not_due',pushSent=0;
 if(Number(parts.day)===config.mail_day){
  if(!health.mailConfigured)mail='not_configured';else{
   const month=previousMonth(day),key='payroll:'+month,report=payrollReport(month,people,records);
   const claimed=await control({action:'claim',key,report:{from,to:[config.recipient],subject:`Fraid · Výkaz hodín ${month}`,text:payrollText(report)}});
   if(claimed.claimed){try{
    const res=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':'fraid-'+key},body:JSON.stringify(claimed.report)});
    const result=await res.json();await control({action:'finish',key,ok:res.ok,providerId:res.ok?result.id:null,error:res.ok?null:`Email provider HTTP ${res.status}`});mail=res.ok?'sent':'failed';
   }catch{await control({action:'finish',key,ok:false,error:'Email transport failure'});mail='failed';}}else mail='already_processed';
  }
 }
 const expiring=expiryItems(records,day);
 if(expiring.length&&pub&&priv){
  const owners=people.filter(p=>p.active&&p.role==='admin'&&p.user_id).map(p=>p.user_id);
  if(owners.length){const {data:subs,error}=await db.from('fraid_v2_push').select('*').in('user_id',owners);if(error)throw Error('Subscriptions unavailable');
   for(const sub of subs||[]){
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sub.endpoint)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    const key=`expiry:${day}:${hash}`,report={title:'Fraid · Spotreba v sklade',body:expiring.slice(0,3).map(s=>`${s.name}: ${s.expiryDate}${s.days<0?' (po dátume)':''}`).join('; ')+(expiring.length>3?` a ďalších ${expiring.length-3}`:''),tag:'fraid-expiry-'+day};
    const claimed=await control({action:'claim',key,report});if(!claimed.claimed)continue;
    try{const r=await sendOne(sub,JSON.stringify(claimed.report),pub,priv);await control({action:'finish',key,ok:r.ok,error:r.ok?null:`Push provider HTTP ${r.status}`});if(r.ok)pushSent++;
     if(r.status===404||r.status===410)await db.from('fraid_v2_push').delete().eq('endpoint',sub.endpoint);
    }catch{await control({action:'finish',key,ok:false,error:'Push delivery failed'});}
   }
  }
 }
 return json({mail,pushSent});
 }catch{return json({error:'Scheduled reporting failed'},500);}
});
