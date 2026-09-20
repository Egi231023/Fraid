-- Fraid v2: additive schema. Does not alter legacy or Biogreens access.
begin;
create schema if not exists fraid_private;
revoke all on schema fraid_private from public, anon;
grant usage on schema fraid_private to authenticated;
create table if not exists public.fraid_v2_people (
 id text primary key, user_id uuid unique references auth.users(id), name text not null,
 avatar text, role text not null default 'employee' check(role in ('employee','admin')),
 active boolean not null default true, legacy jsonb not null default '{}'
);
create table if not exists public.fraid_v2_records (
 kind text not null check(kind in ('entries','shifts','availability','recipes','sales','notes','ideas','settings','wages','stock','movements','templates','checks','corrections')),
 id text not null, owner_id text references public.fraid_v2_people(id), data jsonb not null,
 version integer not null default 1, updated_at timestamptz not null default now(),
 primary key(kind,id), check(jsonb_typeof(data)='object')
);
create index if not exists fraid_v2_owner_kind on public.fraid_v2_records(owner_id,kind);
create index if not exists fraid_v2_date on public.fraid_v2_records(kind,(data->>'date'));
create table if not exists public.fraid_v2_audit (
 id bigint generated always as identity primary key, actor text, action text not null,
 kind text not null, record_id text not null, before_data jsonb, after_data jsonb,
 reason text, created_at timestamptz not null default now()
);
create table if not exists fraid_private.requests (
 actor uuid not null, request_id uuid not null, payload jsonb not null,
 response jsonb not null, created_at timestamptz not null default now(), primary key(actor,request_id)
);
create table if not exists fraid_private.release (id boolean primary key default true check(id), live boolean not null default false);
insert into fraid_private.release values(true,false) on conflict do nothing;
create or replace function fraid_private.employee_id() returns text language sql stable security definer set search_path='' as $$
 select id from public.fraid_v2_people where user_id=auth.uid() and active
$$;
create or replace function fraid_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fraid_v2_people where user_id=auth.uid() and active and role='admin')
$$;
alter table public.fraid_v2_people enable row level security;
alter table public.fraid_v2_records enable row level security;
alter table public.fraid_v2_audit enable row level security;
revoke all on public.fraid_v2_people,public.fraid_v2_records,public.fraid_v2_audit from anon,authenticated;
grant select on public.fraid_v2_people,public.fraid_v2_records,public.fraid_v2_audit to authenticated;
create policy fraid_members_read on public.fraid_v2_people for select to authenticated using (fraid_private.employee_id() is not null);
create policy fraid_records_read on public.fraid_v2_records for select to authenticated using (
 fraid_private.employee_id() is not null and (
 fraid_private.is_admin() or
 (kind in ('recipes','notes','settings','stock','movements','templates','checks')) or
 (kind='shifts' and data->>'status'='published') or
 (owner_id=fraid_private.employee_id() and kind in ('entries','sales','ideas','wages','availability','corrections'))
 ));
create policy fraid_audit_read on public.fraid_v2_audit for select to authenticated using(fraid_private.is_admin());

-- Import only Fraid. Credentials never enter v2 public tables.
insert into public.fraid_v2_people(id,name,avatar,legacy)
select e->>'id',e->>'name',e->>'avatar',e-'pin'-'hodinovka' from public.fraid_data f,
lateral jsonb_array_elements(f.value->'employees') e where f.id='fraid-main' on conflict do nothing;
insert into public.fraid_v2_records(kind,id,owner_id,data)
select 'wages',e->>'id',e->>'id',jsonb_build_object('hourly',e->'hodinovka') from public.fraid_data f,
lateral jsonb_array_elements(f.value->'employees') e where f.id='fraid-main' on conflict do nothing;
insert into public.fraid_v2_records(kind,id,owner_id,data)
select section.key, coalesce(item->>'id','legacy_'||section.key||'_'||ordinality),
case when exists(select 1 from public.fraid_v2_people p where p.id=coalesce(item->>'employeeId',item->>'authorId')) then coalesce(item->>'employeeId',item->>'authorId') end,
item || case when section.key='shifts' then '{"status":"published"}'::jsonb else '{}'::jsonb end
from public.fraid_data f, lateral jsonb_each(f.value) section,
lateral jsonb_array_elements(case when jsonb_typeof(section.value)='array' then section.value else '[]'::jsonb end) with ordinality a(item,ordinality)
where f.id='fraid-main' and section.key in ('entries','shifts','recipes','sales','notes','ideas') on conflict do nothing;
insert into public.fraid_v2_records(kind,id,data)
select 'settings','main',coalesce(value->'settings','{}') || '{"capacity":1,"scheduleConfirmed":false,"hours":{"1":["08:00","16:00"],"2":["08:00","16:00"],"3":["08:00","16:00"],"4":["08:00","16:00"],"5":["08:00","16:00"],"6":["10:00","14:00"]}}'::jsonb
from public.fraid_data where id='fraid-main' on conflict do nothing;

create or replace function fraid_private.write_record(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor text:=fraid_private.employee_id(); admin boolean:=fraid_private.is_admin();
 op text:=p->>'op'; k text:=p->>'kind'; rid text:=p->>'id'; d jsonb:=coalesce(p->'data','{}');
 previous public.fraid_v2_records; result public.fraid_v2_records; target public.fraid_v2_records;
 owner text; req uuid; cached fraid_private.requests; reason text:=trim(coalesce(p->>'reason',''));
 day text:=to_char(now() at time zone 'Europe/Bratislava','YYYY-MM-DD');
 tm text:=to_char(now() at time zone 'Europe/Bratislava','HH24:MI');
 amount numeric; total numeric; overlap_count integer; capacity integer; target_user uuid;
 person jsonb; item jsonb; uid uuid:=auth.uid(); who text;
begin
 if octet_length(p::text)>1500000 then raise exception 'Požiadavka je príliš veľká.'; end if;
 if uid is null or actor is null then raise exception 'Prístup nie je schválený.' using errcode='42501'; end if;
 if not (select live from fraid_private.release where id) then
  raise exception 'Nová verzia ešte nie je aktivovaná. Údaje sú zatiaľ iba na čítanie.';
 end if;
 req:=(p->>'requestId')::uuid;
 if req is null then raise exception 'Chýba identifikátor požiadavky.'; end if;
 perform pg_advisory_xact_lock(824603921);
 select * into cached from fraid_private.requests q where q.actor=uid and q.request_id=req;
 if found then
  if cached.payload<>p then raise exception 'Identifikátor požiadavky už bol použitý.'; end if;
  return cached.response;
 end if;
 if op='person' then
  if not admin then raise exception 'Vyžaduje sa administrátor.' using errcode='42501'; end if;
  if rid=actor and (coalesce(d->>'role','employee')<>'admin' or not coalesce((d->>'active')::boolean,true)) then raise exception 'Vlastný administrátorský prístup tu nemožno zrušiť.'; end if;
  if length(trim(d->>'name'))<1 or length(d->>'name')>100 then raise exception 'Doplň meno.'; end if;
  if nullif(trim(d->>'email'),'') is not null then
   select id into target_user from auth.users where lower(email)=lower(trim(d->>'email')) and email_confirmed_at is not null;
   if target_user is null then raise exception 'Používateľ sa musí najprv zaregistrovať a overiť e-mail.'; end if;
  else select user_id into target_user from public.fraid_v2_people where id=rid;
  end if;
  select to_jsonb(x) into person from public.fraid_v2_people x where id=rid;
  insert into public.fraid_v2_people(id,name,avatar,user_id,role,active) values(rid,trim(d->>'name'),d->>'avatar',target_user,coalesce(d->>'role','employee'),coalesce((d->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name, avatar=excluded.avatar,user_id=excluded.user_id,role=excluded.role,active=excluded.active;
  insert into public.fraid_v2_audit(actor,action,kind,record_id,before_data,after_data,reason) values(actor,op,'people',rid,person,d-'email',reason);
  insert into fraid_private.requests values(uid,req,p,'{"ok":true}',now()); return '{"ok":true}';
 end if;
 if op='clock' then
  if d->>'action' not in ('in','out') then raise exception 'Neplatná akcia.'; end if;
  k:='entries';
  select * into previous from public.fraid_v2_records where kind=k and owner_id=actor and nullif(data->>'timeOut','') is null and coalesce(data->>'status','')<>'void' order by data->>'date' limit 1;
  if d->>'action'='in' then
   if found then raise exception 'Máš otvorený príchod. Najprv vyrieš odchod.'; end if;
   rid:=req::text; owner:=actor;
   d:=jsonb_build_object('date',day,'timeIn',tm,'timeOut',null,'startedAt',now(),'employeeId',actor,'status','open');
  else
   if not found then raise exception 'Nemáš otvorený príchod.'; end if;
   if previous.data->>'date'<>day then raise exception 'Starší príchod musí opraviť administrátor.'; end if;
   rid:=previous.id; owner:=actor; d:=previous.data||jsonb_build_object('timeOut',tm,'endedAt',now(),'status','closed');
  end if;
 elsif op='stock_move' then
  select * into target from public.fraid_v2_records where kind='stock' and id=d->>'stockId';
  if not found then raise exception 'Položka skladu neexistuje.'; end if;
  if reason='' then raise exception 'Doplň dôvod pohybu.'; end if;
  amount:=(d->>'quantity')::numeric;
  if amount is null or amount<0 or amount>1000000 then raise exception 'Neplatné množstvo.'; end if;
  if d->>'type'='inventory' then
   if not admin then raise exception 'Inventúru schvaľuje administrátor.' using errcode='42501'; end if;
   if (p->>'version')::int is distinct from target.version then raise exception 'Stav skladu sa zmenil. Obnov údaje.' using errcode='40001'; end if;
   amount:=amount-coalesce((target.data->>'quantity')::numeric,0);
  elsif d->>'type' in ('consume','waste') then if amount<=0 then raise exception 'Množstvo musí byť kladné.'; end if; amount:=-amount;
  elsif d->>'type'<>'receive' then raise exception 'Neplatný pohyb.';
  end if;
  total:=coalesce((target.data->>'quantity')::numeric,0)+amount;
  if total<0 then raise exception 'Nedostatočná zásoba.'; end if;
  update public.fraid_v2_records set data=jsonb_set(data,'{quantity}',to_jsonb(total)),version=version+1,updated_at=now() where kind='stock' and id=target.id;
  k:='movements'; rid:=req::text; owner:=actor;
  d:=d||jsonb_build_object('delta',amount,'balance',total,'reason',reason,'date',day,'createdAt',now(),'authorId',actor);
 else
  if op not in ('save','void','approve_correction','publish') then raise exception 'Neplatná operácia.'; end if;
  if k in ('settings','wages','stock','templates','recipes','shifts') and not admin then raise exception 'Vyžaduje sa administrátor.' using errcode='42501'; end if;
  select * into previous from public.fraid_v2_records where kind=k and id=rid;
  if found and (p->>'version')::int is distinct from previous.version then raise exception 'Záznam medzitým zmenil niekto iný. Obnov údaje.' using errcode='40001'; end if;
  if not found and coalesce((p->>'version')::int,0)<>0 then raise exception 'Záznam už neexistuje.'; end if;
  owner:=case when admin then coalesce(nullif(d->>'employeeId',''),previous.owner_id,actor) else actor end;
  if k in ('settings','wages','stock','templates','recipes','shifts') and not admin then raise exception 'Vyžaduje sa administrátor.' using errcode='42501'; end if;
  if k not in ('settings','wages','stock','templates','recipes','shifts','availability','sales','notes','ideas','checks','corrections','entries') then raise exception 'Neplatný typ záznamu.'; end if;
  if previous.id is not null and previous.owner_id is distinct from actor and not admin then raise exception 'Cudzí záznam nemôžeš upravovať.' using errcode='42501'; end if;
  if op='void' then
   if not admin or reason='' then raise exception 'Zrušenie vyžaduje administrátora a dôvod.'; end if;
   d:=previous.data||'{"status":"void"}';
  elsif k='entries' then
   if not admin or reason='' or previous.id is null then raise exception 'Dochádzku opravuje administrátor s dôvodom.'; end if;
   if d->>'date' is distinct from previous.data->>'date' or d->>'employeeId' is distinct from previous.data->>'employeeId' then raise exception 'Deň a osobu dochádzky nemožno meniť.'; end if;
   if coalesce(d->>'timeIn','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (nullif(d->>'timeOut','') is not null and (d->>'timeOut' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or d->>'timeOut'<=d->>'timeIn')) then raise exception 'Neplatný čas dochádzky.'; end if;
   d:=d-'startedAt'-'endedAt'||jsonb_build_object('status',case when nullif(d->>'timeOut','') is null then 'open' else 'closed' end,'corrected',true);
  elsif k='corrections' then
   if op='approve_correction' then
    if not admin or previous.id is null then raise exception 'Vyžaduje sa administrátor.'; end if;
    select * into target from public.fraid_v2_records where kind='entries' and id=previous.data->>'entryId';
    if target.version is distinct from (previous.data->>'entryVersion')::int then raise exception 'Dochádzka sa zmenila. Žiadosť treba skontrolovať.'; end if;
    if previous.data->>'status'<>'pending' then raise exception 'Žiadosť už bola vybavená.'; end if;
    if coalesce(previous.data->>'reason','')='' then raise exception 'Chýba dôvod.'; end if;
    item:=target.data-'startedAt'-'endedAt'||jsonb_build_object('timeIn',previous.data->>'timeIn','timeOut',previous.data->>'timeOut','status','closed','corrected',true);
    update public.fraid_v2_records set data=item,version=version+1,updated_at=now() where kind='entries' and id=target.id;
    insert into public.fraid_v2_audit(actor,action,kind,record_id,before_data,after_data,reason) values(actor,'correction','entries',target.id,target.data,item,previous.data->>'reason');
    d:=previous.data||jsonb_build_object('status','approved','approvedBy',actor); owner:=previous.owner_id;
   else
    select * into target from public.fraid_v2_records where kind='entries' and id=d->>'entryId';
    if target.owner_id is distinct from actor or previous.id is not null then raise exception 'Neplatná žiadosť.'; end if;
    if coalesce(d->>'reason','')='' or coalesce(d->>'timeIn','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(d->>'timeOut','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or d->>'timeOut'<=d->>'timeIn' then raise exception 'Doplň platné časy a dôvod.'; end if;
    d:=d||jsonb_build_object('status','pending','entryVersion',target.version);
   end if;
  elsif k in ('shifts','availability') then
   perform (d->>'date')::date;
   if coalesce(d->>'date','')='' or coalesce(d->>'startTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(d->>'endTime','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or d->>'endTime'<=d->>'startTime' then raise exception 'Doplň platný dátum a čas.'; end if;
   d:=d||jsonb_build_object('employeeId',owner);
   if k='shifts' then
    if op='publish' then d:=previous.data||'{"status":"published"}'; end if;
    if coalesce(d->>'status','') not in ('draft','published') then raise exception 'Neplatný stav zmeny.'; end if;
    if exists(select 1 from public.fraid_v2_records where kind=k and id<>rid and owner_id=owner and data->>'date'=d->>'date' and data->>'status'<>'void' and data->>'startTime'<d->>'endTime' and data->>'endTime'>d->>'startTime') then raise exception 'Táto osoba už má v danom čase zmenu.'; end if;
    if d->>'status'='published' then
     select coalesce((data->>'capacity')::int,1) into capacity from public.fraid_v2_records where kind='settings' and id='main';
     -- Check concurrency at every start boundary, not number of intersecting intervals.
     select coalesce(max(n),0) into overlap_count from (
      select count(*) n from (select d->>'startTime' t union select data->>'startTime' from public.fraid_v2_records where kind='shifts' and id<>rid and data->>'date'=d->>'date' and data->>'status'='published' and data->>'startTime'>=d->>'startTime' and data->>'startTime'<d->>'endTime') points
      join public.fraid_v2_records r on r.kind='shifts' and r.id<>rid and r.data->>'date'=d->>'date' and r.data->>'status'='published' and r.data->>'startTime'<=points.t and r.data->>'endTime'>points.t group by points.t
     ) counts;
     if overlap_count>=capacity then raise exception 'Prekročená kapacita zmeny.'; end if;
    end if;
   end if;
  elsif k='sales' then
   if previous.id is not null and (not admin or reason='') then raise exception 'Tržbu opravuje administrátor s dôvodom.'; end if;
   if coalesce(d->>'date','')='' or (d->>'date')::date > (now() at time zone 'Europe/Bratislava')::date then raise exception 'Neplatný dátum tržby.'; end if;
   foreach who in array array['cash','card','tips'] loop
    amount:=(d->>who)::numeric;
    if amount is null or amount<0 or amount>1000000 or amount<>round(amount,2) then raise exception 'Neplatná suma.'; end if;
   end loop;
   if exists(select 1 from public.fraid_v2_records where kind=k and id<>rid and data->>'date'=d->>'date' and coalesce(data->>'status','')<>'void') then raise exception 'Pre tento deň už existuje tržba. Požiadaj o opravu.'; end if;
   if not admin and (d->>'cashCounted') is null then raise exception 'Doplň spočítanú hotovosť.'; end if;
   if d ? 'cashCounted' and ((d->>'cashCounted')::numeric<0 or (d->>'cashCounted')::numeric>1000000) then raise exception 'Neplatná hotovosť.'; end if;
   d:=d||jsonb_build_object('authorId',owner,'status','closed');
  elsif k='stock' then
   if length(trim(coalesce(d->>'name','')))<1 or coalesce(d->>'unit','') not in ('g','kg','ml','l','ks') then raise exception 'Doplň názov a jednotku.'; end if;
   if coalesce((d->>'minimum')::numeric,0)<0 or nullif(d->>'unitCost','')::numeric<0 then raise exception 'Neplatná cena alebo minimum.'; end if;
   if previous.id is not null and d->>'unit' is distinct from previous.data->>'unit' then raise exception 'Jednotku existujúcej položky nemožno meniť.'; end if;
   d:=d||jsonb_build_object('quantity',coalesce((previous.data->>'quantity')::numeric,0));
  elsif k='recipes' then
   if length(trim(coalesce(d->>'name','')))<1 or jsonb_typeof(d->'ingredients') is distinct from 'array' or jsonb_array_length(d->'ingredients')=0 then raise exception 'Doplň názov a suroviny.'; end if;
   for item in select * from jsonb_array_elements(d->'ingredients') loop
    if trim(coalesce(item->>'name',''))='' or coalesce((item->>'quantity')::numeric,0)<=0 or coalesce(item->>'unit','') not in ('g','kg','ml','l','ks') then raise exception 'Doplň surovinu, množstvo a jednotku.'; end if;
   end loop;
   if octet_length(d::text)>1200000 then raise exception 'Fotografia je príliš veľká.'; end if;
  elsif k='checks' then
   select * into target from public.fraid_v2_records where kind='templates' and id=d->>'templateId' and data->>'status'='approved';
   if not found or d->>'date'<>day then raise exception 'Úloha nie je schválená alebo nie je na dnes.'; end if;
   rid:=day||':'||target.id;
   if exists(select 1 from public.fraid_v2_records where kind='checks' and id=rid) then raise exception 'Úloha už bola splnená.'; end if;
   d:=jsonb_build_object('templateId',target.id,'date',day,'completedBy',actor,'completedAt',now(),'title',target.data->>'title');
  elsif k='templates' then
   if trim(coalesce(d->>'title',''))='' or d->>'period' not in ('morning','evening') or d->>'status' not in ('proposed','approved') then raise exception 'Doplň platnú úlohu.'; end if;
  elsif k='settings' then
   rid:='main';
   if coalesce((d->>'capacity')::int,0)<1 or (d->>'capacity')::int>20 or jsonb_typeof(d->'hours') is distinct from 'object' then raise exception 'Neplatná kapacita alebo časy.'; end if;
   for who,item in select * from jsonb_each(d->'hours') loop
    if who not in ('0','1','2','3','4','5','6') or jsonb_array_length(item)<>2 or item->>0 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>1 !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or item->>0>=item->>1 then raise exception 'Neplatné otváracie časy.'; end if;
   end loop;
  elsif k='wages' then
   if coalesce((d->>'hourly')::numeric,-1)<0 or (d->>'hourly')::numeric>1000 then raise exception 'Neplatná hodinovka.'; end if;
  elsif k in ('notes','ideas') then
   if length(trim(coalesce(d->>'text','')))<1 or length(d->>'text')>4000 then raise exception 'Text musí mať 1 až 4000 znakov.'; end if;
  end if;
 end if;
 if rid is null or length(rid)>200 then raise exception 'Neplatný identifikátor.'; end if;
 if previous.id is not null and owner is distinct from previous.owner_id and k not in ('shifts','wages') then owner:=previous.owner_id; end if;
 d:=d||jsonb_build_object('id',rid,'updatedBy',actor);
 insert into public.fraid_v2_records(kind,id,owner_id,data) values(k,rid,owner,d)
 on conflict(kind,id) do update set data=excluded.data,owner_id=excluded.owner_id,version=fraid_v2_records.version+1,updated_at=now() returning * into result;
 insert into public.fraid_v2_audit(actor,action,kind,record_id,before_data,after_data,reason) values(actor,op,k,rid,previous.data,d,reason);
 insert into fraid_private.requests values(uid,req,p,to_jsonb(result),now());
 return to_jsonb(result);
end $$;
create or replace function public.fraid_v2_write(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select fraid_private.write_record(p) $$;
revoke all on all functions in schema fraid_private from public,anon;
grant execute on function fraid_private.employee_id(),fraid_private.is_admin(),fraid_private.write_record(jsonb) to authenticated;
revoke all on function public.fraid_v2_write(jsonb) from public,anon;
grant execute on function public.fraid_v2_write(jsonb) to authenticated;
revoke all on all tables in schema fraid_private from public,anon,authenticated;
commit;
