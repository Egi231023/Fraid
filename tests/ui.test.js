import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
test('all demo sections and edit dialogs render without errors and demo writes are blocked',async()=>{
 const dom=new JSDOM('<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',{url:'https://example.invalid/v2/?demo=1'});
 for(const k of ['window','document','location','sessionStorage','navigator','FormData'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 await import('../v2/app.js?test=ui');await new Promise(r=>setTimeout(r,50));
 assert.match(document.body.textContent,/Dobrý deň, Eugen/);
 for(const page of ['attendance','shifts','recipes','stock','checklists','sales','notes','team','settings','more']){
  const b=document.querySelector(`[data-page="${page}"]`);assert.ok(b,page);b.click();assert.ok(document.querySelector('#view').textContent.length>20,page);
 }
 const actions=['shift-new','availability-new','recipe-new','stock-new','template-new','sale-new','note-new','idea-new','person-new','settings-edit'];
 for(const a of actions){document.querySelector('[data-page="more"]').click();const btn=document.createElement('button');btn.dataset.action=a;document.querySelector('#app').append(btn);btn.click();await new Promise(r=>setTimeout(r,0));assert.ok(document.querySelector('#dialog').open,a);assert.ok(document.querySelector('#editor'),a);document.querySelector('[data-action="close"]').click();}
 document.querySelector('[data-page="recipes"]').click();document.querySelector('[data-action="recipe-detail"]').click();assert.match(document.querySelector('#dialog-body').textContent,/Suroviny/);document.querySelector('[data-action="close"]').click();
 document.querySelector('[data-page="today"]').click();document.querySelector('[data-action="clock"]').click();document.querySelector('#editor').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.match(document.querySelector('#form-error').textContent,/Ukážka/);
 dom.window.close();
});
