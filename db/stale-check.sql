-- Schedule after activation; no guessed departure times.
create extension if not exists pg_cron;
create or replace function fraid_private.flag_stale_entries() returns void language plpgsql security invoker set search_path='' as $$
begin
 if not (select live from fraid_private.release where id) then return; end if;
 perform pg_advisory_xact_lock(824603921);
 with changed as (
  update public.fraid_v2_records set data=data||'{"reviewNeeded":true}'::jsonb,version=version+1,updated_at=now()
  where kind='entries' and nullif(data->>'timeOut','') is null and data->>'date'<to_char(now() at time zone 'Europe/Bratislava','YYYY-MM-DD') and coalesce((data->>'reviewNeeded')::boolean,false)=false and coalesce(data->>'status','')<>'void'
  returning id,data
 ) insert into public.fraid_v2_audit(actor,action,kind,record_id,after_data,reason) select null,'flag_stale','entries',id,data,'Neukončená dochádzka z predchádzajúceho dňa; čas odchodu nebol odhadnutý.' from changed;
end $$;
revoke all on function fraid_private.flag_stale_entries() from public,anon,authenticated;
select cron.schedule('fraid-v2-stale-attendance','*/15 * * * *','select fraid_private.flag_stale_entries()');
