import {esc} from './core.js';

function timestamp(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return {stamp:null,clock:false};
 const date=value.slice(0,10),day=Date.parse(date+'T12:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==date)return {stamp:null,clock:false};
 const clock=value.length>10,stamp=clock?Date.parse(value):day;
 return {stamp:Number.isFinite(stamp)?stamp:null,clock:clock&&Number.isFinite(stamp)};
}
const dayFormat = new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',day:'numeric',month:'long',year:'numeric'});
const clockFormat = new Intl.DateTimeFormat('sk-SK',{timeZone:'Europe/Bratislava',hour:'2-digit',minute:'2-digit'});
export function noteMessages(notes, ownId, name) {
 const ordered=notes.map((note,index)=>({note,index,...timestamp(note.createdAt)})).sort((a,b)=>(a.stamp??-Infinity)-(b.stamp??-Infinity)||a.index-b.index);
 let lastDay=null;
 return ordered.map(({note,stamp,clock})=>{
  const day=stamp===null?'Staršie odkazy · bez dátumu':dayFormat.format(stamp);
  const divider=day===lastDay?'':`<li class="chat-day" role="presentation"><span>${esc(day)}</span></li>`;lastDay=day;
  const own=Boolean(note._owner&&note._owner===ownId),author=note._owner?name(note._owner):(note.author||'Pôvodný odkaz');
  return divider+`<li class="chat-message ${own?'is-own':'is-other'}" data-note-id="${esc(note.id)}"><div class="chat-bubble"><div class="chat-author">${esc(own?'Ty':author)}</div><p class="chat-text">${esc(note.text)}</p><div class="chat-time">${!clock?'Čas nezaznamenaný':`<time datetime="${esc(new Date(stamp).toISOString())}" title="${esc(day)}">${esc(clockFormat.format(stamp))}</time>`}</div></div></li>`;
 }).join('');
}

// Presentation state only. All writes/replays stay in the existing application
// persistence layer. There is no separate service, subscription or auto-send.
export function createNotesChat() {
 let user=null,draft='',error='',busy=false,attempt=null,scroll=null,focus=null,forceBottom=false,form=null,rerender=()=>{};
 function identity(next){if(next===user)return;user=next;draft='';error='';busy=false;attempt=null;scroll=null;focus=null;forceBottom=false;form=null;}
 function capture(root){
  const thread=root.querySelector('#notes-thread');
  if(thread&&!forceBottom)scroll={top:thread.scrollTop,bottom:thread.scrollHeight-thread.clientHeight-thread.scrollTop<48};
  const input=root.querySelector('#notes-message');
  focus=input&&root.ownerDocument.activeElement===input?{start:input.selectionStart,end:input.selectionEnd}:null;
 }
 function view({notes,ownId,name,pending,demo=false}) {
  if(!draft&&pending?.op==='save'&&pending.kind==='notes')draft=String(pending.data?.text||'');
  return `<section class="notes-chat" aria-label="Tímový chat"><div class="chat-heading"><span class="chat-presence" aria-hidden="true"></span><div><h2>Tím Fraid</h2><p>Spoločné odkazy pre ďalšiu smenu</p></div></div><div class="chat-thread" id="notes-thread" role="region" aria-label="História správ" tabindex="0"><ol class="chat-messages">${noteMessages(notes,ownId,name)||'<li class="chat-empty"><strong>Tu sa začína konverzácia.</strong><p>Napíš prvý odkaz pre svoj tím.</p></li>'}</ol></div><form class="chat-composer" id="notes-composer" aria-busy="${busy}"><label for="notes-message">Správa pre tím</label><div class="chat-compose-row"><textarea id="notes-message" name="text" rows="2" maxlength="4000" required placeholder="Čo potrebuje vedieť ďalšia smena?" aria-describedby="notes-hint notes-error" ${busy||demo?'disabled':''}>${esc(draft)}</textarea><button type="submit" class="primary chat-send" ${busy||pending||demo?'disabled':''}>${busy?'Odosielam…':'Odoslať'}</button></div><div class="chat-compose-footer"><small id="notes-hint">${demo?'Ukážka · odosielanie vypnuté':'Enter = nový riadok · Ctrl/⌘ + Enter = odoslať'}</small><span id="notes-count">${draft.length}/4000</span></div><p id="notes-error" class="error-text" role="alert">${esc(error)}</p>${pending?'<div class="chat-pending">Najprv over výsledok predchádzajúceho zápisu. <button type="button" data-action="retry-write">Overiť uloženie</button></div>':''}</form></section>`;
 }
 function update(){if(!form?.isConnected)return;form.setAttribute('aria-busy',String(busy));form.querySelector('textarea').disabled=busy;form.querySelector('[type=submit]').disabled=busy;form.querySelector('[type=submit]').textContent=busy?'Odosielam…':'Odoslať';form.querySelector('#notes-error').textContent=error;}
 function mount(root,{send,render,pending,demo=false}) {
  form=root.querySelector('#notes-composer');rerender=render;if(!form)return;
  const input=form.querySelector('textarea'),thread=root.querySelector('#notes-thread');
  thread.scrollTop=!forceBottom&&scroll&&!scroll.bottom?scroll.top:thread.scrollHeight;forceBottom=false;
  if(focus&&!busy&&!demo){input.focus({preventScroll:true});input.setSelectionRange(focus.start,focus.end);}
  input.addEventListener('input',()=>{draft=input.value;form.querySelector('#notes-count').textContent=`${draft.length}/4000`;});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||pending||demo)return;
   draft=input.value;if(!draft.trim()){error='Napíš správu pre tím.';update();return;}
   if(draft.length>4000){error='Správa môže mať najviac 4000 znakov.';update();return;}
   const token={},text=draft;attempt=token;busy=true;error='';update();
   try{
    await send(text);
    if(attempt!==token)return;
    draft='';error='';forceBottom=true;scroll={top:0,bottom:true};focus={start:0,end:0};
   }catch(err){if(attempt!==token)return;error=err?.message||'Správu sa nepodarilo odoslať. Text zostal zachovaný.';}
   finally{if(attempt===token){busy=false;rerender();}}
  });
 }
 function confirmed(payload){if(payload?.op==='save'&&payload.kind==='notes'){error='';if(payload.data?.text===draft){draft='';forceBottom=true;scroll={top:0,bottom:true};focus={start:0,end:0};}}}
 function retryFailed(payload,err){if(payload?.op==='save'&&payload.kind==='notes')error=err?.message||'Zápis bol odmietnutý. Text zostal zachovaný.';}
 return {identity,capture,view,mount,confirmed,retryFailed};
}
