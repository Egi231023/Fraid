begin;
create or replace function fraid_private.write_batch(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cached fraid_private.requests; item jsonb; result jsonb:='[]'; rid uuid:=(p->>'requestId')::uuid;
begin
 if uid is null or not fraid_private.is_admin() then raise exception 'Vyžaduje sa administrátor.' using errcode='42501'; end if;
 if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items')>100 then raise exception 'Neplatný návrh.'; end if;
 perform pg_advisory_xact_lock(824603921);
 select * into cached from fraid_private.requests where actor=uid and request_id=rid;
 if found then if cached.payload<>p then raise exception 'Identifikátor už bol použitý.'; end if; return cached.response; end if;
 for item in select * from jsonb_array_elements(p->'items') loop
  if item->>'kind'<>'shifts' or item->>'op' not in ('save','publish') then raise exception 'Hromadná operácia podporuje iba rozpis.'; end if;
  result:=result||jsonb_build_array(fraid_private.write_record(item));
 end loop;
 insert into fraid_private.requests values(uid,rid,p,result,now()); return result;
end $$;
create or replace function public.fraid_v2_batch(p jsonb) returns jsonb language sql security invoker set search_path='' as $$ select fraid_private.write_batch(p) $$;
revoke all on function fraid_private.write_batch(jsonb),public.fraid_v2_batch(jsonb) from public,anon;
grant execute on function fraid_private.write_batch(jsonb),public.fraid_v2_batch(jsonb) to authenticated;
commit;
