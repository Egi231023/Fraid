import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {openPage} from './helpers/navigation.mjs';
test('all demo sections and edit dialogs render without errors and demo writes are blocked',async()=>{
 const dom=new JSDOM('<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',{url:'https://example.invalid/v2/?demo=1'});
 for(const k of ['window','document','location','sessionStorage','navigator','FormData'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 await import('../v2/app.js?test=ui');await new Promise(r=>setTimeout(r,50));
 assert.match(document.body.textContent,/Dobrý deň, Eugen/);
 assert.deepEqual([...document.querySelectorAll('.sidebar .nav')].map(b=>b.dataset.page),['today','shifts','recipes','more']);
 assert.equal(document.querySelector('.quick-actions'),null);
 for(const page of ['assistant','attendance','shifts','recipes','stock','checklists','sales','notes','team','admin','payroll','settings','more']){
  openPage(page);assert.ok(document.querySelector('#view').textContent.length>20,page);
 }
 openPage('assistant');assert.match(document.querySelector('#view').textContent,/AI zatiaľ nie je aktivovaná/);assert.equal(document.querySelector('#ai-question').disabled,true);
 const actions=[['shifts','shift-new'],['shifts','availability-new'],['recipes','recipe-new'],['stock','stock-new'],['checklists','template-new'],['sales','sale-new'],['notes','note-new'],['notes','idea-new'],['team','person-new'],['settings','settings-edit']];
 for(const [page,a] of actions){openPage(page);document.querySelector(`#view [data-action="${a}"]`).click();await new Promise(r=>setTimeout(r,0));assert.ok(document.querySelector('#dialog').open,a);assert.ok(document.querySelector('#editor'),a);document.querySelector('[data-action="close"]').click();}
 openPage('settings');assert.equal(document.querySelector('.audit-history').open,false);document.querySelector('.audit-history > summary').click();assert.equal(document.querySelector('.audit-history').open,true);
 document.querySelector('[data-page="recipes"]').click();document.querySelector('[data-action="recipe-detail"]').click();assert.match(document.querySelector('#dialog-body').textContent,/Suroviny/);document.querySelector('[data-action="close"]').click();
 document.querySelector('[data-page="today"]').click();document.querySelector('[data-action="clock"]').click();document.querySelector('#editor').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.match(document.querySelector('#form-error').textContent,/Ukážka/);
 dom.window.close();
});
