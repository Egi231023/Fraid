import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
test('login exposes recovery without requiring password; direct recovery request URL works',async()=>{
 const dom=new JSDOM('<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',{url:'https://example.test/v2/'});
 for(const k of ['window','document','location','history','sessionStorage','navigator','FormData'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({})}})};
 await import('../v2/app.js?test=login-forgot');await new Promise(r=>setTimeout(r,0));
 const link=document.querySelector('#forgot-password-link');assert.ok(link);document.querySelector('#auth').elements.email.value='synthetic@example.test';link.click();
 assert.equal(document.querySelector('#forgot-password').elements.email.value,'synthetic@example.test');assert.equal(document.querySelector('input[type=password]'),null);
 document.querySelector('#app').innerHTML='';await import('../v2/app.js?test=direct-forgot');await new Promise(r=>setTimeout(r,0));assert.ok(document.querySelector('#forgot-password'));dom.window.close();
});

test('registration uses production redirect and new-password policy does not block existing logins',async()=>{
 const dom=new JSDOM('<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',{url:'https://example.test/v2/'});
 for(const k of ['window','document','location','history','sessionStorage','navigator','FormData'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 const calls=[];window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({}),signUp:async x=>{calls.push({kind:'signup',...x});return {data:{session:null}};},signInWithPassword:async x=>{calls.push({kind:'login',...x});return {error:{message:'Synthetic rejection'}};}}})};
 await import('../v2/app.js?test=signup-redirect');await new Promise(r=>setTimeout(r,0));
 const form=document.querySelector('#auth');form.elements.email.value='synthetic@example.test';form.elements.password.value='old-pass';
 document.querySelector('#register').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,0);assert.match(document.querySelector('#auth-error').textContent,/12/);
 form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls[0].kind,'login');
 form.elements.password.value='synthetic-long-password';document.querySelector('#register').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[1].options.emailRedirectTo,'https://egi231023.github.io/Fraid/v2/');dom.window.close();
});
