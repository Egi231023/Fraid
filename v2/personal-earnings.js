import {payrollReport} from './reporting.js?v=20260929-ready';
import {today,esc as E,money} from './core.js?v=20260929-ready';

// Reuse exact payroll minutes, historical rates and final cent rounding.
export function personalEarnings(person,records,day=today()){
 if(!person?.id)return null;
 const month=day.slice(0,7);
 const entries=records.filter(r=>r.kind==='entries'&&(r.owner_id||r.data.employeeId)===person.id);
 const ids=new Set(entries.map(r=>r.id));
 const own=records.filter(r=>r.kind==='entries'?ids.has(r.id):r.kind==='wages'?r.id===person.id:r.kind==='corrections'&&ids.has(r.data.entryId));
 return {month,...payrollReport(month,[person],own).rows.find(r=>r.id===person.id)};
}
export function personalEarningsCard(person,records,day=today()){
 const r=personalEarnings(person,records,day);if(!r)return '';
 const monthLabel=new Intl.DateTimeFormat('sk-SK',{month:'long',year:'numeric',timeZone:'Europe/Bratislava'}).format(new Date(r.month+'-01T12:00:00Z'));
 const hours=Math.floor(r.minutes/60),minutes=r.minutes%60,incomplete=r.amount===null;
 const open=r.issues.some(issue=>issue.includes('chýba odchod'));
 return `<div class="personal-earnings" data-earnings-month="${E(r.month)}" role="region" aria-labelledby="personal-earnings-title"><div class="earnings-heading"><h3 id="personal-earnings-title">Už som zarobil</h3><strong class="earnings-amount${incomplete?' is-incomplete':''}">${incomplete?'Na kontrolu':money(r.amount)}</strong></div><p class="earnings-period">${E(monthLabel)} · ${hours} h ${minutes} min <span>overenej dochádzky</span></p>${incomplete?`<p class="earnings-warning">${open?'Otvorená smena ešte nie je započítaná. ':''}Suma nie je úplná; dochádzka alebo platnosť hodinovky vyžaduje kontrolu.</p>`:r.entries?'':'<p class="earnings-note">Tento mesiac zatiaľ bez uzavretej dochádzky.</p>'}<details class="earnings-details"><summary>Výpočet a sadzba</summary><p class="earnings-rate">Sadzba: ${E(r.rateLabel)}</p><p class="earnings-note">Z načítanej dochádzky: presné časy a sadzba platná v deň práce. Nie je to potvrdenie vyplatenia ani čistá mzda.</p></details></div>`;
}

// Update only this read-only card, never an open form or its draft/focus.
export function refreshEarningsMonth(root,person,records,day=today()){
 const card=root.querySelector('[data-earnings-month]');
 if(!person||!card||card.dataset.earningsMonth===day.slice(0,7))return false;
 const details=card.querySelector('.earnings-details'),expanded=Boolean(details?.open),focused=card.ownerDocument.activeElement===details?.querySelector('summary');
 card.outerHTML=personalEarningsCard(person,records,day);
 const next=root.querySelector('[data-earnings-month] .earnings-details');if(next)next.open=expanded;
 if(focused)next?.querySelector('summary')?.focus({preventScroll:true});
 return true;
}
