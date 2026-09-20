import test from 'node:test';import assert from 'node:assert/strict';import nodemailer from 'nodemailer';
import {gmailOptions,gmailMessage,submitGmail,verifyGmail} from '../supabase/functions/fraid-scheduled-reports/gmail.js';
const user='synthetic@gmail.com',payload={to:['recipient@example.com'],subject:'Fraid test',text:'Syntetické údaje',attachments:[{filename:'test.csv',content:Buffer.from('Meno;Hodiny\r\nTest;2').toString('base64')}]};
test('Connection verification never sends mail and closes on success or failure',async()=>{
 let verified=0,closed=0;
 for(const fail of [false,true]){
  const result=await verifyGmail(user,'synthetic',()=>({verify:async()=>{verified++;if(fail)throw Object.assign(Error('sensitive detail'),{code:'EAUTH'});},sendMail:()=>assert.fail('Must not send'),close:()=>closed++}));
  assert.equal(result.state,fail?'failed':'verified');assert.equal(result.messageSent,false);
  assert.doesNotMatch(JSON.stringify(result),/sensitive detail/);
 }
 assert.equal(verified,2);assert.equal(closed,2);
});
test('Gmail transport pins TLS and suppresses credential/message logs',()=>{const o=gmailOptions(user,'synthetic');assert.equal(o.port,465);assert.equal(o.secure,true);assert.equal(o.tls.rejectUnauthorized,true);assert.equal(o.debug,false);assert.equal(o.logger,false);assert.equal(o.disableFileAccess,true);assert.equal(o.disableUrlAccess,true);});
test('Gmail MIME and attachment compose without sending anything',async()=>{const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'windows'});const message=gmailMessage(payload,'payroll-test:2026-08',user),r=await transport.sendMail(message);const text=r.message.toString();assert.match(text,/multipart\/mixed/);assert.match(text,/filename=test.csv/);assert.match(text,/Content-Transfer-Encoding: base64/);assert.equal(message.to,'recipient@example.com');assert.equal(message.from.address,user);});
test('Gmail forbids extra recipients and header injection in recipient',()=>{assert.throws(()=>gmailMessage({...payload,to:['a@example.com','b@example.com']},'payroll:2026-08',user));assert.throws(()=>gmailMessage({...payload,to:['a@example.com\r\nBcc:b@example.com']},'payroll:2026-08',user));});
test('SMTP success means accepted, not delivered; timeout stays uncertain',async()=>{let closed=0;const success=await submitGmail(payload,'payroll:2026-08',user,'synthetic',()=>({sendMail:async()=>({accepted:['recipient@example.com'],rejected:[],messageId:'test-id'}),close:()=>closed++}));assert.equal(success.state,'accepted');const failure=await submitGmail(payload,'payroll:2026-08',user,'synthetic',()=>({sendMail:async()=>{throw Error('private provider detail');},close:()=>closed++}));assert.equal(failure.state,'uncertain');assert.equal(closed,2);assert.doesNotMatch(JSON.stringify(failure),/private provider detail/);});
