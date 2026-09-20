import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import {previousMonth,payrollReport,payrollText,expiryItems} from './reporting.js';
import {sendOne} from './webpush.ts';
import {attachment,submitMail} from './mail.js';
const json=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 let stage='authorization';
 try{
 const token=req.headers.get('X-Fraid-Job');if(!token)return json({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const control=async(p:unknown)=>{const r=await db.rpc('fraid_job_control',{p});if(r.error)throw Error('Scheduler storage error');return r.data;};
 if(!(await control({action:'authorize',token}))?.authorized)return json({error:'Unauthorized'},401);
 stage='configuration';
 const input=await req.json(),config=await control({action:'config'});if(!config)return json({error:'Recipient configuration missing'},503);
 const apiKey=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FRAID_MAIL_FROM'),pub=Deno.env.get('VAPID_PUBLIC_KEY'),priv=Deno.env.get('VAPID_PRIVATE_KEY');
 const gmailUser=Deno.env.get('FRAID_GMAIL_USER'),gmailPassword=Deno.env.get('FRAID_GMAIL_APP_PASSWORD'),gmailMode=Deno.env.get('FRAID_GMAIL_MODE');
 const gmailCredentials=!!(gmailUser&&gmailPassword),useGmail=gmailCredentials&&(gmailMode==='enabled'||(gmailMode==='test'&&input.test===true));
 const health={mailConfigured:!!(apiKey&&from)||(gmailCredentials&&gmailMode==='enabled'),gmailTestConfigured:gmailCredentials&&gmailMode==='test',pushConfigured:!!(pub&&priv)};await control({action:'health',details:health});
 if(input.dryrun){
  const user=Deno.env.get('FRAID_GMAIL_USER'),password=Deno.env.get('FRAID_GMAIL_APP_PASSWORD');
  let gmail:unknown={state:'not_configured',messageSent:false};
  if(user&&password){
   const [{default:nodemailer},{verifyGmail}]=await Promise.all([import('npm:nodemailer@10.0.10'),import('./gmail.js')]);
   gmail=await verifyGmail(user,password,nodemailer.createTransport);
  }
  return json({...health,dryrun:true,gmail});
 }
 const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const test=input.test===true;
 const day=`${parts.year}-${parts.month}-${parts.day}`;if(!test&&Number(parts.hour)<config.local_hour)return json({waiting:true});
 stage='report_data';
 const {people,records}=await control({action:'report_data'});
 let mail='not_due',pushSent=0;
 if(test||Number(parts.day)===config.mail_day){
  if(!health.mailConfigured&&!useGmail)mail='not_configured';else{
   stage='smtp_guard';
   if(useGmail&&!(await control({action:'smtp_ready'}))?.ready)return json({error:'SMTP reservation guard unavailable'},503);
   stage='report_calculation';
   const month=previousMonth(day),key=(test?'payroll-test:':'payroll:')+month,report=payrollReport(month,people,records);
   stage='report_claim';
   const claimed=await control({action:'claim',key,report:{from:useGmail?gmailUser:from,to:[config.recipient],subject:`${test?'TEST · ':''}Fraid · Výkaz hodín ${month}`,text:(test?'Test nastavenia e-mailu; nejde o potvrdenie vyplatenia.\n\n':'')+payrollText(report),attachments:[attachment(report)]}});
   if(claimed.claimed){
    if(useGmail){
     stage='smtp_delivery';
     const [{default:nodemailer},{sendReservedGmail}]=await Promise.all([import('npm:nodemailer@10.0.10'),import('./smtp-delivery.js')]);
     const result=await sendReservedGmail(control,key,claimed,gmailUser,gmailPassword,nodemailer.createTransport);mail=result.state;
    }else{const result=await submitMail(claimed.report,key,apiKey);await control({action:'finish',key,ok:result.ok,providerId:result.providerId,error:result.error});mail=result.state;}
   }else mail='already_processed';
  }
 }
 if(test)return json({mail,test:true,deliveryConfirmed:false});
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
 return json({mail,pushSent,deliveryConfirmed:false});
 }catch{return json({error:'Scheduled reporting failed',stage},500);}
});
