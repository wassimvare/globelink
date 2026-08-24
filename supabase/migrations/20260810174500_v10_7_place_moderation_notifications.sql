-- GlobeLink V10.7
-- Notifications utilisateur quand un lieu/une activité soumis est validé ou refusé.

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'notification_type'
  ) then
    if not exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'notification_type'
        and e.enumlabel = 'place_approved'
    ) then
      alter type public.notification_type add value 'place_approved';
    end if;

    if not exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'notification_type'
        and e.enumlabel = 'place_rejected'
    ) then
      alter type public.notification_type add value 'place_rejected';
    end if;
  end if;
end $$;

create or replace function private.notify_place_moderation_result()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_type text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.moderation_status is not distinct from new.moderation_status then
    return new;
  end if;

  if new.moderation_status not in ('approved', 'rejected') then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  v_type := case
    when new.moderation_status = 'approved' then 'place_approved'
    else 'place_rejected'
  end;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    metadata
  )
  values (
    new.user_id,
    new.moderation_reviewed_by,
    v_type::public.notification_type,
    jsonb_strip_nulls(
      jsonb_build_object(
        'place_id', new.id,
        'place_name', left(coalesce(new.name, 'lieu'), 120),
        'status', new.moderation_status,
        'reason', nullif(new.moderation_rejection_reason, ''),
        'city', nullif(new.city, ''),
        'country', nullif(new.country, '')
      )
    )
  );

  return new;
end
$$;

revoke all on function private.notify_place_moderation_result() from public, anon, authenticated;

drop trigger if exists notify_place_moderation_result on public.places;
create trigger notify_place_moderation_result
after update of moderation_status on public.places
for each row
when (old.moderation_status is distinct from new.moderation_status)
execute function private.notify_place_moderation_result();
