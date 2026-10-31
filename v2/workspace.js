// Presentation-only expanded workspace; native zoom and operational DOM stay intact.
export function createWorkspace({doc=document,win=window}={}) {
 let expanded=false,section=null,view=null,origin=null,locked=false,bodyStyle=null,modalScroll=null;
 const html=doc.documentElement,dialog=doc.querySelector('#dialog');
 const scroll=()=>({x:win.scrollX||0,y:win.scrollY||0});
 const restore=p=>{if(p&&(win.scrollX!==p.x||win.scrollY!==p.y))win.scrollTo?.(p.x,p.y);};
 function updateButton(){const b=view?.querySelector('[data-workspace-toggle]');if(b){b.textContent=expanded?'Vrátiť zobrazenie':'Rozbaliť tabuľku';b.setAttribute('aria-pressed',String(expanded));}}
 function setExpanded(value){if(value===expanded)return;if(value)origin=scroll();expanded=value;html.classList.toggle('workspace-expanded',expanded);updateButton();if(!value){restore(origin);origin=null;}}
 function reset(){setExpanded(false);section=null;view=null;}
 function sync(next,page){if(section!==page)setExpanded(false);section=page;view=next;if(!next)return;if(!next.querySelector('table')&&page!=='shifts'){setExpanded(false);return;}let bar=next.querySelector('.workspace-tools');if(!bar){bar=doc.createElement('div');bar.className='workspace-tools';const b=doc.createElement('button');b.type='button';b.dataset.workspaceToggle='';b.setAttribute('aria-controls',next.id);b.title='Rozbaliť obsah cez celú plochu aplikácie alebo vrátiť navigáciu';b.addEventListener('click',()=>setExpanded(!expanded));bar.append(b);next.prepend(bar);}updateButton();}
 function keydown(e){if(e.key==='Escape'&&!e.defaultPrevented&&!dialog?.open&&expanded){setExpanded(false);view?.querySelector('[data-workspace-toggle]')?.focus({preventScroll:true});}}
 function viewport(){html.style.setProperty('--workspace-viewport-height',`${win.visualViewport?.height||win.innerHeight}px`);html.style.setProperty('--workspace-viewport-top',`${win.visualViewport?.offsetTop||0}px`);}
 function unlock(){if(!locked)return;locked=false;bodyStyle===null?doc.body.removeAttribute('style'):doc.body.setAttribute('style',bodyStyle);restore(modalScroll);modalScroll=null;}
 function modal(){if(dialog?.open&&!locked){locked=true;bodyStyle=doc.body.getAttribute('style');modalScroll=scroll();Object.assign(doc.body.style,{position:'fixed',top:`-${modalScroll.y}px`,left:`-${modalScroll.x}px`,width:'100%',overflow:'hidden'});viewport();}else if(!dialog?.open)unlock();}
 const observer=dialog&&win.MutationObserver?new win.MutationObserver(modal):null;
 observer?.observe(dialog,{attributes:true,attributeFilter:['open']});dialog?.addEventListener('close',modal);doc.addEventListener('keydown',keydown);win.addEventListener('resize',viewport);win.visualViewport?.addEventListener('resize',viewport);win.visualViewport?.addEventListener('scroll',viewport);viewport();modal();
 return {sync,reset,destroy(){reset();observer?.disconnect();unlock();dialog?.removeEventListener('close',modal);doc.removeEventListener('keydown',keydown);win.removeEventListener('resize',viewport);win.visualViewport?.removeEventListener('resize',viewport);win.visualViewport?.removeEventListener('scroll',viewport);html.style.removeProperty('--workspace-viewport-height');html.style.removeProperty('--workspace-viewport-top');}};
}
