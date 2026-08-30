create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions(endpoint);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;

create policy "push subscriptions select own"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "push subscriptions delete own"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time bigint default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if coalesce(length(trim(p_endpoint)),0) < 20 or coalesce(length(trim(p_p256dh)),0) < 20 or coalesce(length(trim(p_auth)),0) < 8 then
    raise exception 'invalid push subscription' using errcode='22023';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, expiration_time, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, p_expiration_time, left(p_user_agent, 500));
end;
$function$;

revoke all on function public.register_push_subscription(text,text,text,bigint,text) from public;
grant execute on function public.register_push_subscription(text,text,text,bigint,text) to authenticated;
