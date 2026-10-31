// A report is a server-frozen snapshot. The browser never chooses recipients or
// sends payroll values. Retain only the operation identity across reloads.
export function createMonthlyReportSend({invoke,storage,randomId=()=>crypto.randomUUID()}) {
 let busy=false,preview=null,result=null,identity=null,owner=null,message='';
 const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
 const key=userId=>'fraid:monthly-report:'+userId;
 function load(userId){
  if(owner===userId)return;
  owner=userId;preview=null;result=null;identity=null;message='';
  try{const saved=JSON.parse(storage.getItem(key(userId))||'null');if(saved&&validMonth(saved.month)&&typeof saved.requestId==='string')identity=saved;}catch{}
 }
 const snapshot=()=>({busy,preview,result,identity:identity?{...identity}:null,message});
 function persist(){storage.setItem(key(owner),JSON.stringify(identity));}
 async function request(action){
  const {data,error}=await invoke({manual:true,action,month:identity.month,requestId:identity.requestId});
  if(error)throw error;
  return data;
 }
 return {snapshot,load,
  async prepare(month,userId,{fresh=false}={}){
   if(busy)return snapshot();
   if(!validMonth(month)||!userId)throw Error('Vyber platný mesiac a prihlás sa ako administrátor.');
   load(userId);
   if(fresh&&identity?.attempted&&!result?.results?.every(x=>['accepted','already_processed'].includes(x.state)))throw Error('Najprv over výsledok pôvodnej požiadavky.');
   if(fresh||!identity){identity={month,requestId:randomId(),attempted:false};preview=null;result=null;persist();}
   busy=true;message='Načítavam úplný výkaz a príjemcov…';
   try{
    const data=await request('preview');
    if(data?.scope!=='full_payroll'||data.requestId!==identity.requestId||data.month!==identity.month||!Array.isArray(data.recipients)||!data.recipients.length||!Array.isArray(data.report?.rows))throw Error('Neplatný náhľad výkazu. Odoslanie je zablokované.');
    preview=data;message=identity.attempted?'Obnovený náhľad pôvodnej požiadavky; e-mail už mohol byť prijatý. Overenie použije rovnakú požiadavku.':'Náhľad je pripravený. E-mail ešte nebol odoslaný.';
   }catch(error){message='Náhľad sa nepodarilo overiť. Opakovanie použije tú istú požiadavku.';throw Error(message);}
   finally{busy=false;}
   return snapshot();
  },
  async send(){
   if(busy)return snapshot();
   if(!preview||!identity)throw Error('Najprv načítaj a potvrď náhľad výkazu.');
   identity.attempted=true;persist();
   busy=true;message='Odosielam potvrdený úplný výkaz…';
   try{
    const data=await request('send');
    if(data?.requestId!==identity.requestId||data?.month!==identity.month||!Array.isArray(data?.results)||data.results.length!==preview.recipients.length||!preview.recipients.every(r=>data.results.some(x=>x.recipient===r)))throw Error('Uncertain response');
    result=data;
    const accepted=data.results.filter(x=>['accepted','already_processed'].includes(x.state)).length;
    message=accepted===data.results.length?'Poskytovateľ prijal výkaz pre všetkých príjemcov. Prijatie do schránky tým ešte nie je potvrdené.':`Potvrdené prijatie: ${accepted} z ${data.results.length}. Zvyšné výsledky vyžadujú kontrolu. Opakovanie použije rovnakú požiadavku, nie nový e-mail.`;
   }catch{
    result=null;message='Výsledok nie je istý; e-mail už mohol byť prijatý. Overiť alebo zopakovať možno iba tú istú požiadavku. Nevytváraj nový výkaz na obídenie neistého výsledku.';
   }finally{busy=false;}
   return snapshot();
  }
 };
}
