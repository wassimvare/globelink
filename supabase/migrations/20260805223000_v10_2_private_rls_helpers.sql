-- GlobeLink V10.2: keep privileged RLS helpers outside the exposed API schema.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.current_user_email_verified() set schema private;
alter function public.current_user_is_staff() set schema private;
alter function public.has_role(uuid, public.app_role) set schema private;
alter function public.is_admin(uuid) set schema private;
alter function public.is_conversation_participant(uuid, uuid) set schema private;
alter function public.is_match_group_member(uuid, uuid) set schema private;
alter function public.is_moderator_or_admin(uuid) set schema private;
alter function public.is_public_profile(uuid) set schema private;
alter function public.has_active_ai_pro_access(uuid) set schema private;

-- Moving the original functions preserves the OID references already stored in
-- RLS policies. Replace only the helper-to-helper calls whose SQL body contained
-- an explicit public schema name.
create or replace function private.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.has_role(_user_id, 'admin'::public.app_role)
$$;

create or replace function private.is_moderator_or_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select private.has_role(_user_id, 'admin'::public.app_role)
      or private.has_role(_user_id, 'moderator'::public.app_role)
$$;

create or replace function private.has_active_ai_pro_access(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select
    p_user_id is not null
    and (p_user_id = (select auth.uid()) or private.current_user_is_staff())
    and coalesce((select p.ai_access <> 'disabled' from public.profiles p where p.id = p_user_id), false)
    and (
      exists (
        select 1 from public.ai_subscriptions s
        where s.user_id = p_user_id
          and s.status in ('active', 'trialing')
          and (s.current_period_end is null or s.current_period_end > now())
      )
      or exists (
        select 1 from public.ai_admin_grants g
        where g.user_id = p_user_id
          and g.status = 'active'
          and g.starts_at <= now()
          and g.expires_at > now()
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = p_user_id and ur.role in ('admin', 'moderator')
      )
    )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- A few intentional public RPCs were created historically with explicit
-- public helper names in their stored body. These invoker wrappers are not
-- callable through PostgREST, but keep those trusted function bodies working.
create function public.current_user_email_verified()
returns boolean
language sql
stable
security invoker
set search_path = private, public, pg_temp
as $$ select private.current_user_email_verified() $$;

create function public.current_user_is_staff()
returns boolean
language sql
stable
security invoker
set search_path = private, public, pg_temp
as $$ select private.current_user_is_staff() $$;

create function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = private, public, pg_temp
as $$ select private.has_role(_user_id, _role) $$;

revoke all on function public.current_user_email_verified() from public, anon, authenticated;
revoke all on function public.current_user_is_staff() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.current_user_email_verified() to service_role;
grant execute on function public.current_user_is_staff() to service_role;
grant execute on function public.has_role(uuid, public.app_role) to service_role;

commit;
