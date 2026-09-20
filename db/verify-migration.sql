begin;
create temporary table restored_data as table fraid_backup.pre_v2_data_20260920;
create temporary table restored_push as table fraid_backup.pre_v2_push_20260920;
do $$ declare item record; n bigint; begin
 if exists((select * from restored_data except select * from fraid_backup.pre_v2_data_20260920) union all (select * from fraid_backup.pre_v2_data_20260920 except select * from restored_data)) then raise exception 'Restore mismatch'; end if;
 if exists((select * from restored_push except select * from fraid_backup.pre_v2_push_20260920) union all (select * from fraid_backup.pre_v2_push_20260920 except select * from restored_push)) then raise exception 'Push restore mismatch'; end if;
 for item in select section.key k,section.value v from fraid_backup.pre_v2_data_20260920 f,lateral jsonb_each(f.value) section where f.id='fraid-main' and section.key in ('entries','shifts','recipes','sales','notes','ideas') loop
  select count(*) into n from public.fraid_v2_records where kind=item.k;
  if n<>jsonb_array_length(item.v) then raise exception 'Count mismatch: %',item.k; end if;
  if exists(select 1 from jsonb_array_elements(item.v) e where not exists(select 1 from public.fraid_v2_records r where r.kind=item.k and r.id=e->>'id' and r.data @> e)) then raise exception 'Content mismatch: %',item.k; end if;
 end loop;
 if exists(select 1 from public.fraid_v2_people where legacy ? 'pin' or legacy ? 'hodinovka') then raise exception 'Credential/wage leak in directory'; end if;
 if (select count(*) from public.fraid_v2_people)<>(select jsonb_array_length(value->'employees') from fraid_backup.pre_v2_data_20260920 where id='fraid-main') then raise exception 'People mismatch'; end if;
end $$;
rollback;
select 'PASS: restore rehearsal and exact legacy record preservation' as result;
