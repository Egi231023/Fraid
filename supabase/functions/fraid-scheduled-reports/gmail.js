// Gmail SMTP adapter; caller must reserve the attempt durably before sending.
export function gmailOptions(user,password){
 if(!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(user||'')||!password)throw Error('Gmail configuration missing');
 return {host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:password.replace(/\s/g,'')},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},pool:false,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,maxRecipients:1,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:10000};
}
export async function verifyGmail(user,password,createTransport){
 let transport;
 try{
  transport=createTransport(gmailOptions(user,password));
  await transport.verify();
  return {state:'verified',messageSent:false};
 }catch(error){
  const code=['EAUTH','ECONNECTION','ETIMEDOUT','EDNS','ESOCKET'].includes(error?.code)?error.code:'UNAVAILABLE';
  return {state:'failed',code,messageSent:false};
 }finally{try{transport?.close();}catch{}}
}
export function gmailMessage(payload,key,user){
 if(!/^(payroll|payroll-test):\d{4}-(0[1-9]|1[0-2])$/.test(key)||payload.to?.length!==1||!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(payload.to[0]))throw Error('Invalid report envelope');
 return {from:{name:'Fraid',address:user},to:payload.to[0],subject:payload.subject,text:payload.text,html:payload.html,messageId:`<fraid-${key.replace(':','-')}@gmail.com>`,disableFileAccess:true,disableUrlAccess:true,attachments:(payload.attachments||[]).map(a=>({filename:a.filename,content:a.content,encoding:'base64',contentType:'text/csv; charset=utf-8'}))};
}
export async function submitGmail(payload,key,user,password,createTransport){
 let transport;
 try{
  const options=gmailOptions(user,password),message=gmailMessage(payload,key,user);
  transport=createTransport(options);
  // Caller MUST persist a terminal attempt reservation before entering here.
  // SMTP has no idempotency key: a stable Message-ID is not deduplication.
  const result=await transport.sendMail(message);
  if(result.accepted?.length===1&&!result.rejected?.length)return {state:'accepted',ok:true,providerId:result.messageId||message.messageId,error:null};
  return {state:'uncertain',ok:false,providerId:null,error:'Gmail acceptance unconfirmed; manual review required'};
 }catch{
  // Never leak SMTP errors, addresses, credentials or report content to logs.
  // Even timeout may occur AFTER acceptance. Do not automatically retry.
  return {state:'uncertain',ok:false,providerId:null,error:'Gmail send unconfirmed; manual review required'};
 }finally{try{transport?.close();}catch{}}
}
