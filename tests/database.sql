-- All test users and data are rolled back, including audit/idempotency records.
begin;
insert into auth.users(id,email,role,aud,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','fraid-admin-test@example.invalid','authenticated','authenticated',now()),
('22222222-2222-4222-8222-222222222222','fraid-employee-test@example.invalid','authenticated','authenticated',now()),
('33333333-3333-4333-8333-333333333333','fraid-outsider-test@example.invalid','authenticated','authenticated',now());
insert into public.fraid_v2_people(id,user_id,name,role) values
('test-admin','11111111-1111-4111-8111-111111111111','TEST ADMIN','admin'),
('test-employee','22222222-2222-4222-8222-222222222222','TEST EMPLOYEE','employee');
update fraid_private.release set live=true;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if exists(select 1 from public.fraid_v2_records) then raise exception 'FAIL unapproved reads'; end if;
 begin perform public.fraid_v2_write('{"op":"save","kind":"notes","id":"test-note","data":{"text":"test"},"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'); raise exception 'FAIL unapproved writes'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare result jsonb; before_version integer; begin
 result:=public.fraid_v2_write('{"op":"save","kind":"stock","id":"test-stock","data":{"name":"TEST","unit":"ks","minimum":2},"version":0,"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}');
 result:=public.fraid_v2_write('{"op":"stock_move","data":{"stockId":"test-stock","type":"receive","quantity":10},"reason":"TEST","requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}');
 result:=public.fraid_v2_write('{"op":"stock_move","data":{"stockId":"test-stock","type":"receive","quantity":10},"reason":"TEST","requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"}');
 if (select (data->>'quantity')::numeric from public.fraid_v2_records where kind='stock' and id='test-stock')<>10 then raise exception 'FAIL duplicate receipt'; end if;
 begin perform public.fraid_v2_write('{"op":"save","kind":"stock","id":"test-stock","data":{"name":"stale","unit":"ks","minimum":2},"version":1,"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"}'); raise exception 'FAIL stale write'; exception when serialization_failure then null; end;
 result:=public.fraid_v2_write('{"op":"save","kind":"wages","id":"test-private-wage","data":{"employeeId":"test-admin","hourly":10},"version":0,"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4"}');
end $$;

do $$ declare d jsonb; v integer; result jsonb; begin
 select data,version into d,v from public.fraid_v2_records where kind='settings' and id='main';
 perform public.fraid_v2_write(jsonb_build_object('op','save','kind','settings','id','main','version',v,'data',d||'{"capacity":2}', 'requestId',gen_random_uuid()));
 perform public.fraid_v2_write('{"op":"save","kind":"shifts","id":"test-shift1","version":0,"data":{"employeeId":"test-admin","date":"2099-01-05","startTime":"08:00","endTime":"16:00","status":"published"},"requestId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"}');
 perform public.fraid_v2_write('{"op":"save","kind":"shifts","id":"test-shift2","version":0,"data":{"employeeId":"test-employee","date":"2099-01-05","startTime":"08:00","endTime":"16:00","status":"published"},"requestId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"}');
 begin
 perform public.fraid_v2_write('{"op":"save","kind":"shifts","id":"test-shift3","version":0,"data":{"employeeId":"test-admin","date":"2099-01-05","startTime":"10:00","endTime":"12:00","status":"published"},"requestId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3"}');raise exception 'FAIL duplicate person shift';
 exception when raise_exception then if sqlerrm='FAIL duplicate person shift' then raise; end if; end;
 perform public.fraid_v2_write('{"op":"save","kind":"sales","id":"test-sale","version":0,"data":{"date":"2001-01-01","cash":10,"card":20,"tips":2,"cashCounted":10},"requestId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4"}');
 if (select data->>'date' from public.fraid_v2_records where kind='sales' and id='test-sale')<>'2001-01-01' then raise exception 'FAIL sale date'; end if;
 begin
 perform public.fraid_v2_write('{"op":"save","kind":"sales","id":"test-sale2","version":0,"data":{"date":"2001-01-01","cash":10,"card":20,"tips":2,"cashCounted":10},"requestId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5"}');raise exception 'FAIL duplicate sale';
 exception when raise_exception then if sqlerrm='FAIL duplicate sale' then raise; end if; end;
 -- A failing second operation must roll back the entire batch.
 begin
 perform public.fraid_v2_batch('{"requestId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc1","items":[{"op":"save","kind":"shifts","id":"test-batch1","version":0,"data":{"employeeId":"test-admin","date":"2099-01-06","startTime":"08:00","endTime":"16:00","status":"draft"},"requestId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc2"},{"op":"save","kind":"shifts","id":"test-batch2","version":0,"data":{"employeeId":"test-admin","date":"2099-01-06","startTime":"09:00","endTime":"15:00","status":"draft"},"requestId":"cccccccc-cccc-4ccc-8ccc-ccccccccccc3"}]}');raise exception 'FAIL invalid batch';
 exception when raise_exception then if sqlerrm='FAIL invalid batch' then raise; end if; end;
 if exists(select 1 from public.fraid_v2_records where id='test-batch1') then raise exception 'FAIL partial batch'; end if;
end $$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare result jsonb; req jsonb; begin
 if exists(select 1 from public.fraid_v2_records where kind='wages' and owner_id<>'test-employee') then raise exception 'FAIL wage leak'; end if;
 if exists(select 1 from public.fraid_v2_records where kind='entries' and owner_id<>'test-employee') then raise exception 'FAIL attendance leak'; end if;
 if exists(select 1 from public.fraid_v2_audit) then raise exception 'FAIL audit leak'; end if;
 begin update public.fraid_v2_people set role='admin' where id='test-employee'; raise exception 'FAIL self escalation'; exception when insufficient_privilege then null; end;
 begin perform public.fraid_v2_write('{"op":"save","kind":"settings","id":"main","data":{"capacity":20},"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5"}'); raise exception 'FAIL employee settings'; exception when insufficient_privilege then null; end;
 req:='{"op":"clock","data":{"action":"in"},"requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6"}';
 result:=public.fraid_v2_write(req); result:=public.fraid_v2_write(req);
 if (select count(*) from public.fraid_v2_records where kind='entries' and owner_id='test-employee')<>1 then raise exception 'FAIL duplicate clock'; end if;
 result:=public.fraid_v2_write('{"op":"stock_move","data":{"stockId":"test-stock","type":"consume","quantity":3},"reason":"TEST","requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"}');
 if (select (data->>'quantity')::numeric from public.fraid_v2_records where kind='stock' and id='test-stock')<>7 then raise exception 'FAIL consume'; end if;
 begin perform public.fraid_v2_write('{"op":"stock_move","data":{"stockId":"test-stock","type":"consume","quantity":8},"reason":"TEST","requestId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8"}'); raise exception 'FAIL negative stock'; exception when raise_exception then if sqlerrm='FAIL negative stock' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.fraid_v2_people; raise exception 'FAIL anonymous directory'; exception when insufficient_privilege then null; end;
 begin perform public.fraid_v2_write('{}'); raise exception 'FAIL anonymous RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: anonymous denial, unapproved denial, employee isolation, no role escalation, idempotency, stock arithmetic, stale version rejection; all fixtures rolled back' as result;
