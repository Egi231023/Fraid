begin;
-- Roles are exercised without a real operational write.
set local role anon;
do $$ begin
 if exists(select 1 from public.fraid_data where id='fraid-main') then raise exception 'Anonymous Fraid read remains open'; end if;
 if not exists(select 1 from public.fraid_data where id='biogreens-main') then raise exception 'Biogreens legacy read changed'; end if;
 begin
  insert into public.fraid_data(id,value) values('fraid-main','{}') on conflict(id) do update set value=excluded.value;
  raise exception 'FAIL: anonymous Fraid write accepted';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.fraid_push_subs s where not exists(select 1 from public.fraid_data f,lateral jsonb_array_elements(f.value->'employees') e where f.id='biogreens-main' and e->>'id'=s.employee_id)) then raise exception 'Legacy subscriptions exposed outside Biogreens'; end if;
end $$;
reset role;
do $$ begin
 if not (select live from fraid_private.release where id) then raise exception 'Release inactive'; end if;
 if exists((select * from public.fraid_data where id='biogreens-main' except select * from fraid_backup.cutover_data where id='biogreens-main') union all (select * from fraid_backup.cutover_data where id='biogreens-main' except select * from public.fraid_data where id='biogreens-main')) then raise exception 'Biogreens data changed'; end if;
end $$;
rollback;
select 'PASS: anonymous Fraid read/write denied, legacy push scoped, Biogreens preserved, release active' as result;
