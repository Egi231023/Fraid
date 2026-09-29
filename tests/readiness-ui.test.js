import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {database,userIds} from './helpers/database.mjs';
import {openPage} from './helpers/navigation.mjs';
const tick=()=>new Promise(r=>setTimeout(r,20));
test('admin dated wage and employee withdrawal forms persist through the real RPC in an isolated database',async()=>{
 const f=await database();let dom;const timers=new Set(),originalTimeout=globalThis.setTimeout;globalThis.setTimeout=(...args)=>{const id=originalTimeout(...args);timers.add(id);return id;};try{
  await f.seedEntry('entry',{reviewNeeded:true});await f.actor('employee');
  await f.write({op:'save',kind:'corrections',id:'correction',version:0,data:{entryId:'entry',timeIn:'08:00',timeOut:'16:00',reason:'Synthetic correction'}});
  for(const actor of ['admin','employee']){
   await f.actor(actor);
   dom=new JSDOM('<div id="status"></div><div id="app"></div><dialog id="dialog"><div id="dialog-body"></div></dialog>',{url:'https://example.invalid/v2/'});
   for(const k of ['window','document','location','sessionStorage','navigator','FormData'])Object.defineProperty(globalThis,k,{value:dom.window[k],configurable:true});
   dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
   window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:userIds[actor]}}}}),onAuthStateChange:()=>({})},
    from(table){assert.ok(['fraid_v2_people','fraid_v2_records','fraid_v2_audit'].includes(table));const chain={select:()=>chain,order:()=>chain,range:()=>chain,limit:()=>chain,then(resolve,reject){return f.db.query('select * from public.'+table).then(r=>({data:JSON.parse(JSON.stringify(r.rows)),error:null})).then(resolve,reject);}};return chain;},
    async rpc(name,{p}={}){if(name==='fraid_delivery_status')return {data:null};try{return {data:await f.write(p),error:null};}catch(e){return {error:{message:e.message}};}}
   })};
   await import('../v2/app.js?readiness-ui='+actor);for(let n=0;n<100&&!document.querySelector('#view');n++)await tick();assert.ok(document.querySelector('#view'),document.body.textContent);
   if(actor==='admin'){
    openPage('admin');assert.match(document.querySelector('#view').textContent,/Príprava prevádzky/);
    openPage('team');document.querySelector('[data-action="wage"][data-id="employee"]').click();
    const form=document.querySelector('#editor');form.elements.hourly.value='5,50';form.elements.effectiveFrom.value='2026-09-01';form.elements.reason.value='Synthetic signed agreement';
    await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(document.querySelector('#dialog').open,false,document.querySelector('#form-error').textContent);
    const wage=(await f.records()).find(r=>r.kind==='wages');assert.equal(wage.data.rates[0].hourly,5.5);assert.equal(wage.data.rates[0].effectiveFrom,'2026-09-01');
    openPage('attendance');assert.ok(document.querySelector('[data-action="reject-correction"]'));
   }else{
    openPage('more');
    for(const page of ['team','admin','payroll'])assert.equal(document.querySelector(`[data-page="${page}"]`),null);
    for(const page of ['stock','checklists','sales','notes','settings','assistant','shifts','recipes'])openPage(page);
    openPage('attendance');assert.equal(document.querySelector('[data-action="reject-correction"]'),null);document.querySelector('[data-action="withdraw-correction"]').click();
    const form=document.querySelector('#editor');form.elements.reason.value='Synthetic withdrawal';await form.onsubmit({preventDefault(){},currentTarget:form});
    assert.equal(document.querySelector('#dialog').open,false,document.querySelector('#form-error').textContent);assert.equal((await f.records()).find(r=>r.id==='correction').data.status,'withdrawn');
   }
   dom.window.close();dom=null;
  }
 }finally{for(const id of timers)clearTimeout(id);globalThis.setTimeout=originalTimeout;dom?.window.close();await f.close();}
});
