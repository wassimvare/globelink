-- GlobeLink V11.0.1 — Travel Match notifications + reliable inbox handoff.
-- Uses the existing notification_type='like' enum value with metadata so this
-- remains compatible with already-provisioned databases.

create or replace function public.send_match_like(_from_user_id uuid, _to_user_id uuid)
returns table(matched boolean, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_or_existing uuid;
  inserted_rows integer := 0;
begin
  if (select auth.uid()) is null
     or (select auth.uid()) <> _from_user_id
     or not public.current_user_email_verified() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if _from_user_id is null or _to_user_id is null or _from_user_id = _to_user_id then
    return query select false, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = _to_user_id and email_verified_at is not null and status = 'active'
  ) then
    raise exception 'Target profile not found' using errcode = 'P0002';
  end if;

  insert into public.match_likes (from_user_id, to_user_id)
  values (_from_user_id, _to_user_id)
  on conflict (from_user_id, to_user_id) do nothing;
  get diagnostics inserted_rows = row_count;

  -- Notify the liked traveler immediately, once per real like.
  if inserted_rows > 0 then
    insert into public.notifications (recipient_id, actor_id, type, metadata)
    values (
      _to_user_id,
      _from_user_id,
      'like',
      jsonb_build_object(
        'scope', 'travel_match',
        'event', 'like',
        'from_user_id', _from_user_id,
        'to_user_id', _to_user_id
      )
    );
  end if;

  if not exists (
    select 1 from public.match_likes
    where from_user_id = _to_user_id and to_user_id = _from_user_id
  ) then
    return query select false, null::uuid;
    return;
  end if;

  created_or_existing := public.open_or_create_direct_conversation(_to_user_id);

  -- The second unique like establishes the match. Notify BOTH travelers and
  -- attach the direct conversation so the notification opens Messages.
  if inserted_rows > 0 then
    insert into public.notifications (recipient_id, actor_id, type, metadata)
    values
      (
        _from_user_id,
        _to_user_id,
        'like',
        jsonb_build_object(
          'scope', 'travel_match',
          'event', 'match',
          'conversation_id', created_or_existing,
          'other_user_id', _to_user_id
        )
      ),
      (
        _to_user_id,
        _from_user_id,
        'like',
        jsonb_build_object(
          'scope', 'travel_match',
          'event', 'match',
          'conversation_id', created_or_existing,
          'other_user_id', _from_user_id
        )
      );
  end if;

  return query select true, created_or_existing;
end;
$$;

revoke all on function public.send_match_like(uuid, uuid) from public, anon;
grant execute on function public.send_match_like(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
