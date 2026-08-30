create unique index if not exists notifications_call_unique_idx
  on public.notifications (recipient_id, ((metadata ->> 'call_id')))
  where type = 'call' and metadata ? 'call_id';

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r uuid;
  signal text;
  call_id text;
  kind text;
begin
  if new.attachment_type = 'rtc' then
    signal := coalesce(new.attachment_meta ->> 'signal', '');
    if signal <> 'invite' then
      return new;
    end if;

    call_id := new.attachment_meta ->> 'call_id';
    kind := coalesce(new.attachment_meta ->> 'kind', 'audio');

    for r in
      select user_id
      from public.conversation_participants
      where conversation_id = new.conversation_id
        and user_id <> new.sender_id
    loop
      insert into public.notifications (recipient_id, actor_id, type, message_id, metadata)
      values (
        r,
        new.sender_id,
        'call',
        new.id,
        jsonb_build_object(
          'conversation_id', new.conversation_id,
          'call_id', call_id,
          'kind', kind,
          'event', 'incoming_call'
        )
      )
      on conflict do nothing;
    end loop;
    return new;
  end if;

  if new.attachment_type = 'call' then
    return new;
  end if;

  for r in
    select user_id
    from public.conversation_participants
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id
  loop
    insert into public.notifications (recipient_id, actor_id, type, message_id, metadata)
    values (
      r,
      new.sender_id,
      'message',
      new.id,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'preview', left(coalesce(new.content, ''), 140)
      )
    )
    on conflict do nothing;
  end loop;
  return new;
end;
$function$;
