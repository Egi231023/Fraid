// A draft, display-only rule. It never changes records or payroll calculations.
export const attendancePolicyDraft = Object.freeze({
  version: 'draft-2026-10-29',
  active: false,
  effectiveFrom: null,
  halfHourBoundaryConfirmed: false,
  departureFrom: '15:55',
  departureThrough: '16:15',
  internalEnd: '16:00',
});

const minutes = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0,2))*60+Number(value.slice(3)) : null;
const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;

export function previewAttendancePolicy({arrival,departure}, rule=attendancePolicyDraft) {
  const raw={arrival,departure},start=minutes(arrival),end=minutes(departure),reasons=[];
  let roundedStart=null,internalEnd=null;
  if(start===null) reasons.push('Doplň platný skutočný príchod.');
  else if(start%60>30&&!rule.halfHourBoundaryConfirmed) reasons.push('Pravidlo pre druhú polovicu hodiny ešte čaká na potvrdenie.');
  else {
    const lower=Math.floor(start/30)*30;
    const rounded=start-lower<=15?lower:lower+30;
    if(rounded>=1440) reasons.push('Zaokrúhlenie by prešlo do ďalšieho dňa; vyžaduje kontrolu.');
    else roundedStart=clock(rounded);
  }
  if(end===null) reasons.push('Chýba platný skutočný odchod; odchod sa nedopĺňa automaticky.');
  else if(start!==null&&end<=start) reasons.push('Odchod musí byť po príchode v tom istom dni.');
  else if(end<minutes(rule.departureFrom)||end>minutes(rule.departureThrough)) reasons.push('Odchod mimo 15:55–16:15 rieši administrátor.');
  else internalEnd=rule.internalEnd;
  return {
    mode:'preview',version:rule.version,raw,
    internal:{arrival:roundedStart,departure:internalEnd},
    reviewRequired:reasons.length>0,reasons,
    applied:false,payrollMinutes:null,
  };
}
