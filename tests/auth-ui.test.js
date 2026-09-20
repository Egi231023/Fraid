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
