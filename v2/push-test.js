// One deliberate attempt per mounted app. An uncertain network result is never
// retried automatically: the notification may already have reached the phone.
export function createPushTest({invoke,onChange=()=>{}}) {
 let state='ready',message='Test odošle jednu skúšobnú správu iba na tvoje prihlásené zariadenia.';
 const snapshot=()=>({state,message,disabled:state!=='ready'});
 return {snapshot,async run(){
  if(state!=='ready')return snapshot();
  state='pending';message='Odosielam jeden test…';onChange(snapshot());
  try{
   const {data,error}=await invoke();
   if(error)throw error;
   if(data?.state==='no_devices'){
    state='no_devices';message='Nemáš uložené zariadenie. Na iPhone otvor Fraid z plochy a zapni notifikácie. Potom obnov túto stránku.';
   }else if(data?.state==='accepted'){
    state='accepted';message=`Poskytovateľ prijal test pre ${data.sent} zariadenie/-ia. Over prijatie na telefóne; toto ešte nepotvrdzuje doručenie.`;
   }else if(data?.state==='failed'){
    state='failed';message='Poskytovateľ neprijal všetky upozornenia. Skontroluj telefón a povolenie notifikácií; test sa automaticky neopakuje.';
   }else throw Error('Uncertain notification outcome');
  }catch{
   state='uncertain';message='Výsledok odoslania nie je istý. Najprv skontroluj telefón. Test sa automaticky neopakuje.';
  }
  onChange(snapshot());return snapshot();
 }};
}
