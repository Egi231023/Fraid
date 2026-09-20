import {submitGmail} from './gmail.js';

// A committed terminal reservation precedes every network send. Missing or
// ambiguous reservation acknowledgement must never enter SMTP.
export async function sendReservedGmail(control,key,claim,user,password,createTransport){
 let reservation;
 try{reservation=await control({action:'smtp_reserve',key,attempt:claim.attempt});}
 catch{return {state:'reservation_unconfirmed',ok:false};}
 if(!reservation?.reserved)return {state:'already_processed',ok:false};
 const result=await submitGmail(reservation.report,key,user,password,createTransport);
 try{
  const saved=await control({action:'smtp_finish',key,attemptToken:reservation.attemptToken,ok:result.ok,providerId:result.providerId});
  if(!saved?.recorded)return {state:'uncertain',ok:false};
 }catch{return {state:'uncertain',ok:false};}
 return result;
}
