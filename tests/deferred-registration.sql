-- Isolated, rollback-only verification of registering after migration.
begin;
insert into auth.users(id,email,role,aud,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','fraid-admin-test@example.invalid','authenticated','authenticated',now()),
('22222222-2222-4222-8222-222222222222','fraid-later-test@example.invalid','authenticated','authenticated',null);
insert into public.fraid_v2_people(id,user_id,name,role) values
('test-admin','11111111-1111-4111-8111-111111111111','TEST ADMIN','admin'),
('test-later',null,'TEST LATER','employee');
insert into public.fraid_v2_records(kind,id,owner_id,data) values
('entries','test-old-entry','test-later','{"date":"2000-01-01","timeIn":"08:00","timeOut":"09:00","employeeId":"test-later"}');
update fraid_private.release set live=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select 1 from public.fraid_v2_records) then raise exception 'Unlinked account can read records'; end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 begin
 perform public.fraid_v2_write(jsonb_build_object('op','person','id','test-later','requestId',gen_random_uuid(),'data',jsonb_build_object('name','TEST LATER','email','fraid-later-test@example.invalid','role','employee','active',true)));
 raise exception 'FAIL: linked unverified email';
 exception when raise_exception then if sqlerrm='FAIL: linked unverified email' then raise; end if; end;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select public.fraid_v2_write(jsonb_build_object('op','person','id','test-later','requestId',gen_random_uuid(),'reason','TEST deferred registration','data',jsonb_build_object('name','TEST LATER','email','fraid-later-test@example.invalid','role','employee','active',true)));
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if (select count(*) from public.fraid_v2_records where id='test-old-entry' and owner_id='test-later')<>1 then raise exception 'Existing history not preserved'; end if;
 if fraid_private.is_admin() then raise exception 'Employee received admin role'; end if;
 if exists(select 1 from public.fraid_v2_audit) then raise exception 'Employee can read audit'; end if;
end $$;
rollback;
select 'PASS: delayed registration denies unlinked/unverified accounts and preserves history after admin linking' as result;
