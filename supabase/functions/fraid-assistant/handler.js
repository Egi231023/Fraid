const headers={'Access-Control-Allow-Origin':'https://egi231023.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
// Fail-closed pre-activation endpoint. No provider, business-data read or writes.
// Adding a key cannot activate paid use: activation needs a reviewed adapter,
// an atomic shared quota reservation and owner-approved provider/budget.
export function makeHandler(authorize){return async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Nepovolená metóda.'},405);
 try{
  const bearer=req.headers.get('Authorization');if(!bearer?.startsWith('Bearer '))return json({error:'Prihlás sa.'},401);
  const identity=await authorize(bearer);if(!identity)return json({error:'Prístup nie je schválený.'},403);
  const reader=req.body?.getReader();if(!reader)return json({error:'Chýba požiadavka.'},400);
  let body='',size=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return json({error:'Príliš dlhá požiadavka.'},413);}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();
  let input;try{input=JSON.parse(body);}catch{return json({error:'Neplatná požiadavka.'},400);}
  if(!input||!['status','ask'].includes(input.action))return json({error:'Neplatná operácia.'},400);
  if(input.action==='ask'&&(typeof input.message!=='string'||!input.message.trim()||input.message.length>2000))return json({error:'Otázka musí mať 1 až 2000 znakov.'},400);
  return json({enabled:false,code:'AI_NOT_ACTIVATED',message:'AI zatiaľ nie je aktivovaná.',role:identity.role,maxInputCharacters:2000,requestsAllowed:0,storesChat:false});
 }catch{return json({error:'Pomocník je dočasne nedostupný. Skús neskôr.'},503);}
};}
