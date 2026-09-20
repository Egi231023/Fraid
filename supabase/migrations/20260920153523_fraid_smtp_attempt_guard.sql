-- STAGED ONLY. Requires owner backup gate before production application.
-- No data/table/policy changes. Replaces only existing scheduler control function.
begin;
select pg_advisory_xact_lock(824603921);
do $check$ begin
 if pg_get_functiondef('fraid_private.job_control(jsonb)'::regprocedure) <> $expected$CREATE OR REPLACE FUNCTION fraid_private.job_control(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
$expected$
 then raise exception 'Scheduler baseline changed; review before migration'; end if;
end $check$;
CREATE OR REPLACE FUNCTION fraid_private.job_control(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d fraid_private.deliveries; action text:=p->>'action';
begin
 if action='authorize' then return jsonb_build_object('authorized',coalesce((select decrypted_secret=p->>'token' from vault.decrypted_secrets where name='fraid_jobs_token'),false));
 elsif action='config' then return (select to_jsonb(c) from fraid_private.job_config c where id);
 elsif action='health' then insert into fraid_private.job_health values(true,p->'details',now()) on conflict(id) do update set details=excluded.details,checked_at=now(); return '{}'::jsonb;
 elsif action='claim' then
  insert into fraid_private.deliveries(key,status,lease_until,report) values(p->>'key','processing',now()+interval '10 minutes',p->'report')
  on conflict(key) do update set status='processing',attempts=fraid_private.deliveries.attempts+1,lease_until=now()+interval '10 minutes',updated_at=now()
  where fraid_private.deliveries.status not in ('sent','uncertain') and fraid_private.deliveries.attempts<5 and fraid_private.deliveries.lease_until<now()
  returning * into d;
  if not found then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object('claimed',true,'report',d.report,'attempt',d.attempts);
 elsif action='smtp_ready' then
  return jsonb_build_object('ready',true,'version',1);
 elsif action='smtp_reserve' then
  if coalesce(p->>'key','') !~ '^(payroll|payroll-test):[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid SMTP delivery key'; end if;
  update fraid_private.deliveries set status='uncertain',lease_until='infinity'::timestamptz,
   report=jsonb_set(report,'{_smtpAttempt}',to_jsonb(gen_random_uuid()::text)),
   error='SMTP attempt reserved; acceptance not confirmed; manual review required',updated_at=now()
   where key=p->>'key' and status='processing' and lease_until>now()
    and attempts=(p->>'attempt')::integer
   returning * into d;
  if not found then return jsonb_build_object('reserved',false); end if;
  return jsonb_build_object('reserved',true,'attemptToken',d.report->>'_smtpAttempt','report',d.report);
 elsif action='smtp_finish' then
  update fraid_private.deliveries set
   status=case when p->>'ok'='true' then 'sent' else 'uncertain' end,
   provider_id=case when p->>'ok'='true' then p->>'providerId' else null end,
   error=case when p->>'ok'='true' then null else 'SMTP acceptance unconfirmed; manual review required' end,
   updated_at=now()
   where key=p->>'key' and status='uncertain' and report->>'_smtpAttempt'=p->>'attemptToken'
   returning * into d;
  return jsonb_build_object('recorded',found);
 elsif action='finish' then
  update fraid_private.deliveries set status=case when (p->>'ok')::boolean then 'sent' else 'failed' end,provider_id=p->>'providerId',error=left(p->>'error',200),lease_until=now()+interval '45 minutes',updated_at=now() where key=p->>'key' and status='processing'; return '{}'::jsonb;
 end if;
 raise exception 'Unknown scheduler operation';
end $function$
;
-- CREATE OR REPLACE preserves owner and execute ACL.
commit;
