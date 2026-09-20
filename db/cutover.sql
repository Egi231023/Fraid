-- NOT EXECUTED. Requires verified owner identity, all active profiles linked,
-- successful real-user login, UI testing and authorized GitHub deployment first.
-- Perform while deploying root redirect to /Fraid/v2/. Never enable legacy public
-- access as a rollback; keep v2 read-only if a deployment fails.
begin;
lock table public.fraid_data in share row exclusive mode;
do $$ begin
 if (select live from fraid_private.release where id) then raise exception 'Already activated'; end if;
 if not exists(select 1 from public.fraid_v2_people p join auth.users u on u.id=p.user_id where p.role='admin' and p.active and u.email_confirmed_at is not null) then raise exception 'Verified admin required'; end if;
 if exists(select 1 from public.fraid_v2_people p left join auth.users u on u.id=p.user_id where p.active and (u.id is null or u.email_confirmed_at is null)) then raise exception 'Map all active staff accounts or explicitly archive unused profiles first'; end if;
 if exists(select 1 from public.fraid_v2_audit where action<>'person') then raise exception 'Unexpected v2 operational writes; reconcile before cutover'; end if;
end $$;
-- Fresh, protected snapshot at the actual cutover boundary.
create table fraid_backup.cutover_data as table public.fraid_data;
revoke all on fraid_backup.cutover_data from public,anon,authenticated;
-- Final import: latest legacy data, preserving verified account assignments.
insert into public.fraid_v2_people(id,name,avatar,legacy)
select e->>'id',e->>'name',e->>'avatar',e-'pin'-'hodinovka' from public.fraid_data f,lateral jsonb_array_elements(f.value->'employees') e where f.id='fraid-main'
on conflict(id) do update set name=excluded.name,avatar=excluded.avatar,legacy=excluded.legacy;
insert into public.fraid_v2_records(kind,id,owner_id,data)
select section.key, coalesce(item->>'id','legacy_'||section.key||'_'||ordinality),
case when exists(select 1 from public.fraid_v2_people p where p.id=coalesce(item->>'employeeId',item->>'authorId')) then coalesce(item->>'employeeId',item->>'authorId') end,
item||case when section.key='shifts' then '{"status":"published"}'::jsonb else '{}'::jsonb end
from public.fraid_data f,lateral jsonb_each(f.value) section,lateral jsonb_array_elements(case when jsonb_typeof(section.value)='array' then section.value else '[]'::jsonb end) with ordinality a(item,ordinality)
where f.id='fraid-main' and section.key in ('entries','shifts','recipes','sales','notes','ideas')
on conflict(kind,id) do update set data=excluded.data,owner_id=excluded.owner_id,updated_at=now();
update public.fraid_v2_records r set data=r.data||'{"status":"void","legacyRemoved":true}'::jsonb
where r.kind in ('entries','shifts','recipes','sales','notes','ideas') and not exists(select 1 from public.fraid_data f,lateral jsonb_array_elements(f.value->r.kind) e where f.id='fraid-main' and e->>'id'=r.id);
update public.fraid_v2_records r set data=jsonb_build_object('hourly',e->'hodinovka') from public.fraid_data f,lateral jsonb_array_elements(f.value->'employees') e where f.id='fraid-main' and r.kind='wages' and r.id=e->>'id';
do $$ begin
 if exists(select 1 from public.fraid_v2_people where active and user_id is null) then raise exception 'New legacy employee requires account mapping'; end if;
end $$;
-- Restrict only Fraid's legacy row. Preserve the known Biogreens application.
drop policy "Allow all access" on public.fraid_data;
create policy biogreens_legacy_access on public.fraid_data for all to anon,authenticated using(id='biogreens-main') with check(id='biogreens-main');
-- Disable anonymous access to Fraid push subscriptions, preserving Biogreens IDs.
do $$ declare p record; ids text[]; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='fraid_push_subs' and policyname<>'service_role full access' loop execute format('drop policy %I on public.fraid_push_subs',p.policyname); end loop;
 select array_agg(e->>'id') into ids from public.fraid_data f,lateral jsonb_array_elements(f.value->'employees') e where f.id='biogreens-main';
 execute format('create policy biogreens_legacy_push on public.fraid_push_subs for all to anon using(employee_id=any(%L::text[])) with check(employee_id=any(%L::text[]))',coalesce(ids,'{}'),coalesce(ids,'{}'));
end $$;
update fraid_private.release set live=true;
commit;
-- Also deploy the reviewed legacy push filter (Biogreens IDs only), then verify
-- anonymous Fraid reads/writes fail and both applications have expected access.
