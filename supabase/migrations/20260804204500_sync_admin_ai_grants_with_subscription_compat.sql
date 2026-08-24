alter table public.ai_subscriptions
  add column if not exists access_source text not null default 'stripe';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_subscriptions'::regclass
      and conname = 'ai_subscriptions_access_source_safe'
  ) then
    alter table public.ai_subscriptions
      add constraint ai_subscriptions_access_source_safe
      check (access_source in ('stripe', 'admin')) not valid;
  end if;
end $$;

create or replace function public.normalize_ai_subscription_source()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.stripe_subscription_id is not null or new.stripe_customer_id is not null then
    new.access_source := 'stripe';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_ai_subscription_source_trigger on public.ai_subscriptions;
create trigger normalize_ai_subscription_source_trigger
before insert or update on public.ai_subscriptions
for each row execute function public.normalize_ai_subscription_source();

create or replace function public.admin_set_ai_pro_grant(
  p_user_id uuid,
  p_action text,
  p_duration_days integer default 30,
  p_note text default null
)
returns table (
  status text,
  starts_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  note text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(coalesce(p_action, ''));
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  v_days integer := coalesce(p_duration_days, 30);
  v_expiry timestamptz;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_action = 'grant' then
    if v_days < 1 or v_days > 3650 then raise exception 'INVALID_DURATION'; end if;
    v_expiry := now() + make_interval(days => v_days);
    insert into public.ai_admin_grants (user_id, granted_by, status, starts_at, expires_at, note, created_at, updated_at)
    values (p_user_id, auth.uid(), 'active', now(), v_expiry, v_note, now(), now())
    on conflict (user_id) do update set granted_by = excluded.granted_by, status = 'active', starts_at = now(), expires_at = v_expiry, note = excluded.note, updated_at = now();
    insert into public.ai_subscriptions (user_id, status, current_period_end, created_at, updated_at, access_source)
    values (p_user_id, 'active', v_expiry, now(), now(), 'admin')
    on conflict (user_id) do update set
      status = case when public.ai_subscriptions.access_source = 'stripe' and public.ai_subscriptions.status in ('active', 'trialing') and (public.ai_subscriptions.current_period_end is null or public.ai_subscriptions.current_period_end > now()) then public.ai_subscriptions.status else 'active' end,
      current_period_end = case when public.ai_subscriptions.access_source = 'stripe' and public.ai_subscriptions.status in ('active', 'trialing') and (public.ai_subscriptions.current_period_end is null or public.ai_subscriptions.current_period_end > now()) then public.ai_subscriptions.current_period_end else v_expiry end,
      access_source = case when public.ai_subscriptions.access_source = 'stripe' and public.ai_subscriptions.status in ('active', 'trialing') and (public.ai_subscriptions.current_period_end is null or public.ai_subscriptions.current_period_end > now()) then 'stripe' else 'admin' end,
      updated_at = now();
  elsif v_action = 'revoke' then
    insert into public.ai_admin_grants (user_id, granted_by, status, starts_at, expires_at, note, created_at, updated_at)
    values (p_user_id, auth.uid(), 'revoked', now() - interval '1 second', now(), v_note, now(), now())
    on conflict (user_id) do update set granted_by = excluded.granted_by, status = 'revoked', expires_at = now(), note = excluded.note, updated_at = now();
    update public.ai_subscriptions set status = 'canceled', current_period_end = now(), updated_at = now() where user_id = p_user_id and access_source = 'admin';
  else
    raise exception 'INVALID_ACTION';
  end if;
  return query select g.status, g.starts_at, g.expires_at, g.granted_by, g.note from public.ai_admin_grants g where g.user_id = p_user_id;
end;
$$;

revoke all on function public.admin_set_ai_pro_grant(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_set_ai_pro_grant(uuid, text, integer, text) to authenticated;
revoke all on function public.normalize_ai_subscription_source() from public, anon, authenticated;
