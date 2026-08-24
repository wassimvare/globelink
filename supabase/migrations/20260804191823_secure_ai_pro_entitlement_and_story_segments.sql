-- GlobeLink V9.6.1
-- AI Pro is granted only by an active Stripe subscription or a staff role.

revoke insert, update, delete, truncate, references, trigger
on public.ai_subscriptions from anon, authenticated;

create index if not exists ai_subscriptions_status_period_idx
  on public.ai_subscriptions (status, current_period_end);

create or replace function public.has_active_ai_pro_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and (
      p_user_id = auth.uid()
      or public.current_user_is_staff()
    )
    and coalesce((select p.ai_access <> 'disabled' from public.profiles p where p.id = p_user_id), false)
    and (
      exists (
        select 1
        from public.ai_subscriptions s
        where s.user_id = p_user_id
          and s.status in ('active', 'trialing')
          and (s.current_period_end is null or s.current_period_end > now())
      )
      or exists (
        select 1
        from public.user_roles ur
        where ur.user_id = p_user_id
          and ur.role in ('admin', 'moderator')
      )
    );
$$;

revoke all on function public.has_active_ai_pro_access(uuid) from public, anon;
grant execute on function public.has_active_ai_pro_access(uuid) to authenticated;

update public.profiles p
set ai_access = 'free'
where p.ai_access = 'pro'
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id and ur.role in ('admin', 'moderator')
  )
  and not exists (
    select 1 from public.ai_subscriptions s
    where s.user_id = p.id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
