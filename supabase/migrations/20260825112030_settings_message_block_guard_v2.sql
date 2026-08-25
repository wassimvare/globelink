create or replace function public.enforce_direct_message_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  participant_count integer;
  other_user_id uuid;
begin
  if (select auth.uid()) is null or new.sender_id <> (select auth.uid()) then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select count(*) into participant_count
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id;

  if participant_count <> 2 then
    return new;
  end if;

  select cp.user_id into other_user_id
  from public.conversation_participants cp
  where cp.conversation_id = new.conversation_id
    and cp.user_id <> new.sender_id
  limit 1;

  if other_user_id is not null and exists (
    select 1 from public.user_relationship_controls c
    where c.mode = 'blocked'
      and ((c.owner_id = new.sender_id and c.target_id = other_user_id)
        or (c.owner_id = other_user_id and c.target_id = new.sender_id))
  ) then
    raise exception 'Impossible d''envoyer un message à ce compte.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_direct_message_block() from public, anon, authenticated;

drop trigger if exists messages_block_guard on public.messages;
create trigger messages_block_guard
before insert on public.messages
for each row execute function public.enforce_direct_message_block();
