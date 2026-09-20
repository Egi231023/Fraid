export const recoveryRedirect='https://egi231023.github.io/Fraid/v2/?recovery=1';
export function resetError(error){
 if(error?.status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code))return 'Odosielanie e-mailov je dočasne obmedzené poskytovateľom. Skontroluj posledný e-mail aj Spam alebo to skús neskôr. Ďalší e-mail teraz nebol potvrdený.';
 return 'Odoslanie sa nepodarilo potvrdiť. Skontroluj pripojenie a schránku; potom to môžeš skúsiť znova.';
}
export function mountForgotPassword(client,root,email=''){
 root.innerHTML='<main class="auth"><div class="brand"><img src="assets/FRAID_LOGO_ICON.png" alt="Fraid">Fraid</div><div class="card"><h1>Zabudnuté heslo</h1><p>Zadaj e-mail svojho účtu. Odkaz v e-maile otvorí stránku na nastavenie nového hesla.</p><form id="forgot-password" class="stack"><label>E-mail<input name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false"></label><p id="reset-status" role="status" aria-live="polite"></p><button class="primary" type="submit">Poslať odkaz na obnovu</button></form><p class="auth-note">Skontroluj aj Spam a otvor najnovší e-mail. Odkaz je jednorazový. Bezpečnostné limity poskytovateľa zostávajú platné.</p><a href="./">Späť na prihlásenie</a></div></main>';
 const form=root.querySelector('form'),input=form.elements.email,button=form.querySelector('button'),status=root.querySelector('#reset-status');let busy=false;
 input.value=email;input.focus();
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;input.value=input.value.trim();if(!form.reportValidity())return;
  busy=true;button.disabled=true;status.textContent='Odosielam žiadosť…';
  try{
   const {error}=await client.auth.resetPasswordForEmail(input.value,{redirectTo:recoveryRedirect});
   status.textContent=error?resetError(error):'Žiadosť bola prijatá. Ak k e-mailu existuje účet, príde odkaz na obnovu hesla. Skontroluj aj Spam. Doručenie do schránky zatiaľ nie je potvrdené.';
  }catch{status.textContent=resetError();}finally{busy=false;button.disabled=false;}
 };
}
