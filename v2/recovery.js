export function isRecoveryLocation(location){const hash=new URLSearchParams(location.hash.slice(1));return new URLSearchParams(location.search).get('recovery')==='1'||hash.get('type')==='recovery'||hash.has('error_code');}
export function validatePasswords(password,confirmation){if(password.length<12)return 'Použi aspoň 12 znakov.';if(password!==confirmation)return 'Heslá sa nezhodujú.';return '';}
export async function mountRecovery(client,root){
 let verified=false,notify;const recovered=new Promise(resolve=>{notify=resolve;});
 const subscription=client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){verified=true;notify();}});
 root.innerHTML='<main class="auth"><div class="card"><h1>Obnova hesla</h1><p>Overujem odkaz…</p></div></main>';
 let data={session:null},error;try{({data,error}=await client.auth.getSession());}catch{error=true;}
 // Supabase emits PASSWORD_RECOVERY on the next task after initialization.
 if(!error&&data.session&&!verified){let timeout;await Promise.race([recovered,new Promise(resolve=>{timeout=setTimeout(resolve,1500);})]);clearTimeout(timeout);}
 // Do not retain bearer tokens in the visible URL or expose errors verbatim.
 history.replaceState(null,'',location.pathname+'?recovery=1');
 subscription.data.subscription.unsubscribe();
 if(error||!data.session||!verified){root.innerHTML='<main class="auth"><div class="card"><h1>Odkaz sa nepodarilo overiť</h1><p>Odkaz mohol byť použitý, vypršal alebo sa prerušilo pripojenie. Otvor najnovší e-mail alebo si vyžiadaj nový odkaz.</p><p><a href="?forgot=1">Poslať nový odkaz na obnovu</a></p><a href="./">Späť na prihlásenie</a></div></main>';return;}
 root.innerHTML='<main class="auth"><div class="card"><h1>Nastav nové heslo</h1><p>Heslo zadávaj iba sem. Nikomu ho neposielaj.</p><form id="new-password" class="stack"><label>Nové heslo<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><label>Zopakuj heslo<input name="confirmation" type="password" minlength="12" required autocomplete="new-password"></label><p id="password-error" role="alert"></p><button type="submit" class="primary">Uložiť nové heslo</button></form></div></main>';
 const form=root.querySelector('form'),message=root.querySelector('#password-error');
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button'),password=form.elements.password.value,confirmation=form.elements.confirmation.value;message.textContent=validatePasswords(password,confirmation);if(message.textContent)return;button.disabled=true;
  try{const result=await client.auth.updateUser({password});if(result.error){message.textContent='Heslo sa nepodarilo uložiť. Skús iné silné heslo alebo nový odkaz.';return;}form.reset();const out=await client.auth.signOut();root.innerHTML='<main class="auth"><div class="card"><h1>Heslo je zmenené</h1><p>Teraz sa prihlás novým heslom.</p><a href="./">Prihlásiť sa do Fraid</a></div></main>';if(out.error)root.querySelector('p').textContent='Heslo je zmenené. Odhlásenie ostatných relácií sa nepodarilo potvrdiť.';
  }catch{message.textContent='Spojenie sa prerušilo. Skús prihlásenie novým heslom; ak nefunguje, vyžiadaj nový odkaz.';}finally{button.disabled=false;}
 };
}
