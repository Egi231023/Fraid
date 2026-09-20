begin;
create table public.fraid_v2_push (
 endpoint text primary key check(endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-zA-Z0-9.-]+\.push\.apple\.com)/'),
 user_id uuid not null references auth.users(id), p256dh text not null, auth text not null, updated_at timestamptz not null default now()
);
alter table public.fraid_v2_push enable row level security;
revoke all on public.fraid_v2_push from public,anon,authenticated;
grant select,insert,update,delete on public.fraid_v2_push to authenticated;
create policy own_push on public.fraid_v2_push for all to authenticated using (user_id=(select auth.uid()) and fraid_private.employee_id() is not null) with check(user_id=(select auth.uid()) and fraid_private.employee_id() is not null);
commit;
