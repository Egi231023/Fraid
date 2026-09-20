begin;
select pg_advisory_xact_lock(824603921);
lock table public.fraid_v2_records,public.fraid_v2_people in share mode;
-- Recoverable snapshot before adding stock validation and scheduler state.
create table fraid_backup.pre_reports_records as table public.fraid_v2_records;
create table fraid_backup.pre_reports_people as table public.fraid_v2_people;
revoke all on fraid_backup.pre_reports_records,fraid_backup.pre_reports_people from public,anon,authenticated;
do $$ begin
 if exists((select * from fraid_backup.pre_reports_records except select * from public.fraid_v2_records) union all (select * from public.fraid_v2_records except select * from fraid_backup.pre_reports_records)) then raise exception 'Backup incomplete'; end if;
end $$;
create extension if not exists pg_net;
create table fraid_private.job_config(id boolean primary key default true check(id),recipient text not null,local_hour integer not null default 8,mail_day integer not null default 15);
-- Recipient inserted separately from private owner-confirmed input.
create table fraid_private.deliveries(key text primary key,status text not null,attempts integer not null default 1,lease_until timestamptz,report jsonb not null,provider_id text,error text,updated_at timestamptz not null default now());
alter table fraid_private.job_config enable row level security;
alter table fraid_private.deliveries enable row level security;
create table fraid_private.job_health(id boolean primary key default true check(id),details jsonb not null,checked_at timestamptz not null default now());
alter table fraid_private.job_health enable row level security;
revoke all on fraid_private.job_config,fraid_private.deliveries,fraid_private.job_health from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from vault.secrets where name='fraid_jobs_token') then perform vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'fraid_jobs_token'); end if;
end $$;
create function fraid_private.stock_expiry_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='stock' then
  if nullif(new.data->>'expiryDate','') is not null then
   if new.data->>'expiryDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((new.data->>'expiryDate')::date,'YYYY-MM-DD')<>new.data->>'expiryDate' then raise exception 'Neplatný dátum spotreby.'; end if;
  end if;
  if new.data ? 'expiryWarningDays' and ((new.data->>'expiryWarningDays') !~ '^\d{1,2}$' or (new.data->>'expiryWarningDays')::integer>90) then raise exception 'Predstih upozornenia musí byť 0 až 90 dní.'; end if;
 end if;
 return new;
end $$;
create trigger fraid_stock_expiry_guard before insert or update of data on public.fraid_v2_records for each row execute function fraid_private.stock_expiry_guard();
create function fraid_private.job_control(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d fraid_private.deliveries; action text:=p->>'action';
begin
 if action='authorize' then return jsonb_build_object('authorized',coalesce((select decrypted_secret=p->>'token' from vault.decrypted_secrets where name='fraid_jobs_token'),false));
 elsif action='config' then return (select to_jsonb(c) from fraid_private.job_config c where id);
 elsif action='health' then insert into fraid_private.job_health values(true,p->'details',now()) on conflict(id) do update set details=excluded.details,checked_at=now(); return '{}'::jsonb;
 elsif action='claim' then
  insert into fraid_private.deliveries(key,status,lease_until,report) values(p->>'key','processing',now()+interval '10 minutes',p->'report')
  on conflict(key) do update set status='processing',attempts=fraid_private.deliveries.attempts+1,lease_until=now()+interval '10 minutes',updated_at=now()
  where fraid_private.deliveries.status<>'sent' and fraid_private.deliveries.attempts<5 and fraid_private.deliveries.lease_until<now()
  returning * into d;
  if not found then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object('claimed',true,'report',d.report);
 elsif action='finish' then
  update fraid_private.deliveries set status=case when (p->>'ok')::boolean then 'sent' else 'failed' end,provider_id=p->>'providerId',error=left(p->>'error',200),lease_until=now()+interval '45 minutes',updated_at=now() where key=p->>'key'; return '{}'::jsonb;
 end if;
 raise exception 'Unknown scheduler operation';
end $$;
revoke all on function fraid_private.job_control(jsonb),fraid_private.stock_expiry_guard() from public,anon,authenticated;
grant usage on schema fraid_private to service_role;
grant execute on function fraid_private.job_control(jsonb) to service_role;
create function public.fraid_job_control(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select fraid_private.job_control(p) $$;
revoke all on function public.fraid_job_control(jsonb) from public,anon,authenticated;
grant execute on function public.fraid_job_control(jsonb) to service_role;
create function fraid_private.delivery_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not fraid_private.is_admin() then raise exception 'Vyžaduje sa administrátor.' using errcode='42501'; end if;
 return jsonb_build_object('config',(select to_jsonb(c) from fraid_private.job_config c where id),'health',(select to_jsonb(h) from fraid_private.job_health h where id),'deliveries',coalesce((select jsonb_agg(x) from (select key,status,attempts,error,updated_at from fraid_private.deliveries order by updated_at desc limit 12)x),'[]'::jsonb));
end $$;
revoke all on function fraid_private.delivery_status() from public,anon;
grant execute on function fraid_private.delivery_status() to authenticated;
create function public.fraid_delivery_status() returns jsonb language sql security invoker set search_path='' as $$select fraid_private.delivery_status()$$;
revoke all on function public.fraid_delivery_status() from public,anon;
grant execute on function public.fraid_delivery_status() to authenticated;
create function fraid_private.dispatch_jobs(dryrun boolean default false) returns bigint language plpgsql security invoker set search_path='' as $$
declare token text;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='fraid_jobs_token';
 return net.http_post(url:='https://arbvuovtqntagfpfqfgp.supabase.co/functions/v1/fraid-scheduled-reports',headers:=jsonb_build_object('Content-Type','application/json','X-Fraid-Job',token),body:=jsonb_build_object('dryrun',dryrun),timeout_milliseconds:=10000);
end $$;
revoke all on function fraid_private.dispatch_jobs(boolean) from public,anon,authenticated;
select cron.schedule('fraid-reports-and-expiry','0 * * * *','select fraid_private.dispatch_jobs()');
commit;
