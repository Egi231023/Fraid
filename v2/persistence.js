// Only explicit database transaction rejections prove that nothing committed.
const rejected=new Set(['P0001','42501','23505','23503','23514','22P02','22007','22008','22023','40001','40P01']);
export function definitelyRejected(error){return rejected.has(error?.code);}
export async function submitOperation(client,payload,forget){
 let result;
 try{result=await client.rpc(payload.items?'fraid_v2_batch':'fraid_v2_write',{p:payload});}
 catch{throw Error('Výsledok zápisu nie je známy. Použi Overiť uloženie pôvodného zápisu; nevytváraj nový záznam.');}
 if(result.error){
  if(definitelyRejected(result.error)){
   forget();
   if(result.error.code==='40001')throw Error('Záznam medzitým niekto zmenil. Obnov prehľad a otvor formulár znova.');
   if(result.error.code==='P0001')throw Error(result.error.message||'Databáza zápis odmietla.');
   throw Error(result.error.code==='42501'?'Na túto operáciu nemáš oprávnenie.':'Databáza zápis odmietla. Skontroluj údaje a skús znova.');
  }
  throw Error('Výsledok zápisu nie je známy. Použi Overiť uloženie pôvodného zápisu; nevytváraj nový záznam.');
 }
 if(result.data==null)throw Error('Chýba potvrdenie zápisu. Použi Overiť uloženie pôvodného zápisu.');
 forget();return result.data;
}
