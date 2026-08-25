alter table public.user_settings
  add column if not exists mention_permission text not null default 'everyone',
  add column if not exists tag_permission text not null default 'everyone',
  add column if not exists manual_tag_approval boolean not null default false,
  add column if not exists allow_message_requests boolean not null default true,
  add column if not exists filter_offensive_comments boolean not null default true,
  add column if not exists hidden_words text[] not null default '{}',
  add column if not exists show_activity_status boolean not null default true,
  add column if not exists story_default_audience text not null default 'followers';

do $$ begin
  alter table public.user_settings add constraint user_settings_mention_permission_check check (mention_permission in ('everyone','following','nobody'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_settings add constraint user_settings_tag_permission_check check (tag_permission in ('everyone','following','nobody'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_settings add constraint user_settings_story_default_audience_check check (story_default_audience in ('followers','close_friends'));
exception when duplicate_object then null; end $$;

create table if not exists public.user_mutes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  mute_posts boolean not null default true,
  mute_stories boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);
alter table public.user_mutes enable row level security;
grant select, insert, update, delete on public.user_mutes to authenticated;
drop policy if exists "Users manage own mutes" on public.user_mutes;
create policy "Users manage own mutes" on public.user_mutes for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create table if not exists public.close_friends (
  owner_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);
alter table public.close_friends enable row level security;
grant select, insert, delete on public.close_friends to authenticated;
drop policy if exists "Users manage own close friends" on public.close_friends;
create policy "Users manage own close friends" on public.close_friends for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create table if not exists public.story_hidden_accounts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  check (owner_id <> target_id)
);
alter table public.story_hidden_accounts enable row level security;
grant select, insert, delete on public.story_hidden_accounts to authenticated;
drop policy if exists "Users manage own story hidden accounts" on public.story_hidden_accounts;
create policy "Users manage own story hidden accounts" on public.story_hidden_accounts for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

alter table public.stories add column if not exists audience text not null default 'followers';
do $$ begin
  alter table public.stories add constraint stories_audience_check check (audience in ('followers','close_friends'));
exception when duplicate_object then null; end $$;

create table if not exists public.conversation_requests (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);
alter table public.conversation_requests enable row level security;
grant select on public.conversation_requests to authenticated;
drop policy if exists "Message request participants read" on public.conversation_requests;
create policy "Message request participants read" on public.conversation_requests for select to authenticated
using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tagged_user_id uuid not null references auth.users(id) on delete cascade,
  tagger_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'approved' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, tagged_user_id)
);
alter table public.post_tags enable row level security;
grant select, insert, delete on public.post_tags to authenticated;
drop policy if exists "Relevant users view post tags" on public.post_tags;
create policy "Relevant users view post tags" on public.post_tags for select to authenticated
using (status = 'approved' or (select auth.uid()) = tagger_id or (select auth.uid()) = tagged_user_id);
drop policy if exists "Post owners create tags" on public.post_tags;
create policy "Post owners create tags" on public.post_tags for insert to authenticated
with check (
  (select auth.uid()) = tagger_id
  and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
);
drop policy if exists "Tag parties delete tags" on public.post_tags;
create policy "Tag parties delete tags" on public.post_tags for delete to authenticated
using ((select auth.uid()) = tagger_id or (select auth.uid()) = tagged_user_id);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_presence enable row level security;
grant select, insert, update on public.user_presence to authenticated;

create or replace function private.can_view_activity_status(_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select
    (select auth.uid()) is not null
    and (
      _target_user_id = (select auth.uid())
      or (
        coalesce((select s.show_activity_status from public.user_settings s where s.user_id = _target_user_id), true)
        and not exists (
          select 1 from public.user_relationship_controls c
          where c.mode = 'blocked'
            and ((c.owner_id = (select auth.uid()) and c.target_id = _target_user_id)
              or (c.owner_id = _target_user_id and c.target_id = (select auth.uid())))
        )
      )
    );
$$;
revoke all on function private.can_view_activity_status(uuid) from public;
grant execute on function private.can_view_activity_status(uuid) to authenticated;

drop policy if exists "Users view allowed presence" on public.user_presence;
create policy "Users view allowed presence" on public.user_presence for select to authenticated
using (private.can_view_activity_status(user_id));
drop policy if exists "Users insert own presence" on public.user_presence;
create policy "Users insert own presence" on public.user_presence for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own presence" on public.user_presence;
create policy "Users update own presence" on public.user_presence for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function private.can_reference_user(_author_id uuid, _target_id uuid, _kind text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  permission_value text := 'everyone';
begin
  if _author_id is null or _target_id is null then return false; end if;
  if _author_id = _target_id then return true; end if;
  if exists (
    select 1 from public.user_relationship_controls c
    where (c.mode = 'blocked' and ((c.owner_id = _author_id and c.target_id = _target_id) or (c.owner_id = _target_id and c.target_id = _author_id)))
       or (c.mode = 'restricted' and c.owner_id = _target_id and c.target_id = _author_id)
  ) then return false; end if;

  if _kind = 'tag' then
    select coalesce(s.tag_permission, 'everyone') into permission_value from public.user_settings s where s.user_id = _target_id;
  else
    select coalesce(s.mention_permission, 'everyone') into permission_value from public.user_settings s where s.user_id = _target_id;
  end if;
  permission_value := coalesce(permission_value, 'everyone');
  if permission_value = 'nobody' then return false; end if;
  if permission_value = 'following' then
    return exists (select 1 from public.follows f where f.follower_id = _target_id and f.following_id = _author_id);
  end if;
  return true;
end;
$$;
revoke all on function private.can_reference_user(uuid,uuid,text) from public;
grant execute on function private.can_reference_user(uuid,uuid,text) to authenticated;

create or replace function public.enforce_comment_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_user_id uuid;
  comments_allowed boolean := true;
  filter_offensive boolean := true;
  words text[] := '{}';
  hidden_word text;
begin
  select p.user_id into target_user_id from public.posts p where p.id = new.post_id;
  if target_user_id is null then raise exception 'Publication introuvable' using errcode = 'P0002'; end if;
  if target_user_id = new.user_id then return new; end if;
  if exists (
    select 1 from public.user_relationship_controls c
    where c.mode = 'blocked'
      and ((c.owner_id = new.user_id and c.target_id = target_user_id) or (c.owner_id = target_user_id and c.target_id = new.user_id))
  ) then raise exception 'Interaction impossible avec ce compte.' using errcode = '42501'; end if;

  select coalesce(s.allow_comments, true), coalesce(s.filter_offensive_comments, true), coalesce(s.hidden_words, '{}')
  into comments_allowed, filter_offensive, words
  from public.user_settings s where s.user_id = target_user_id;
  comments_allowed := coalesce(comments_allowed, true);
  filter_offensive := coalesce(filter_offensive, true);
  words := coalesce(words, '{}');
  if not comments_allowed then raise exception 'Les commentaires sont désactivés pour cette publication.' using errcode = '42501'; end if;

  foreach hidden_word in array words loop
    if length(trim(hidden_word)) >= 2 and position(lower(trim(hidden_word)) in lower(coalesce(new.content,''))) > 0 then
      raise exception 'Ce commentaire contient un mot masqué par l’auteur.' using errcode = '42501';
    end if;
  end loop;
  if filter_offensive and lower(coalesce(new.content,'')) ~ '(connard|connasse|salope|pute|encul[eé]|fdp|fuck[ ]+you|bitch)' then
    raise exception 'Ce commentaire a été filtré comme potentiellement offensant.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_comment_permissions() from public, anon, authenticated;

create or replace function private.process_mentions(_author_id uuid, _post_id uuid, _comment_id uuid, _text text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  mentioned_username text;
  mentioned_user_id uuid;
begin
  for mentioned_username in
    select distinct lower(x[1]) from regexp_matches(coalesce(_text,''), '@([A-Za-z0-9_.]{3,30})', 'g') as x
  loop
    select p.id into mentioned_user_id from public.profiles p
      where lower(p.username) = mentioned_username and p.status = 'active' limit 1;
    if mentioned_user_id is null or mentioned_user_id = _author_id then continue; end if;
    if not private.can_reference_user(_author_id, mentioned_user_id, 'mention') then
      raise exception 'Ce compte n’autorise pas cette mention.' using errcode = '42501';
    end if;
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id, metadata)
    values (mentioned_user_id, _author_id, 'mention', _post_id, _comment_id,
      jsonb_build_object('scope', case when _comment_id is null then 'post' else 'comment' end));
  end loop;
end;
$$;
revoke all on function private.process_mentions(uuid,uuid,uuid,text) from public;

create or replace function public.process_post_mentions_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.process_mentions(new.user_id, new.id, null, new.caption);
  return new;
end; $$;
revoke execute on function public.process_post_mentions_trigger() from public, anon, authenticated;
drop trigger if exists trg_process_post_mentions on public.posts;
create trigger trg_process_post_mentions after insert on public.posts for each row execute function public.process_post_mentions_trigger();

create or replace function public.process_comment_mentions_trigger()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  perform private.process_mentions(new.user_id, new.post_id, new.id, new.content);
  return new;
end; $$;
revoke execute on function public.process_comment_mentions_trigger() from public, anon, authenticated;
drop trigger if exists trg_process_comment_mentions on public.comments;
create trigger trg_process_comment_mentions after insert on public.comments for each row execute function public.process_comment_mentions_trigger();

create or replace function public.enforce_post_tag_permissions()
returns trigger
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare manual boolean := false;
begin
  if not private.can_reference_user(new.tagger_id, new.tagged_user_id, 'tag') then
    raise exception 'Ce compte n’autorise pas les identifications.' using errcode = '42501';
  end if;
  select coalesce(s.manual_tag_approval,false) into manual from public.user_settings s where s.user_id = new.tagged_user_id;
  if new.tagger_id = new.tagged_user_id then new.status := 'approved';
  elsif coalesce(manual,false) then new.status := 'pending';
  else new.status := 'approved'; end if;
  new.updated_at := now();
  return new;
end; $$;
revoke execute on function public.enforce_post_tag_permissions() from public, anon, authenticated;
drop trigger if exists trg_enforce_post_tag_permissions on public.post_tags;
create trigger trg_enforce_post_tag_permissions before insert on public.post_tags for each row execute function public.enforce_post_tag_permissions();

create or replace function public.notify_post_tag()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.tagged_user_id <> new.tagger_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, metadata)
    values (new.tagged_user_id, new.tagger_id, 'mention', new.post_id,
      jsonb_build_object('scope','tag','status',new.status));
  end if;
  return new;
end; $$;
revoke execute on function public.notify_post_tag() from public, anon, authenticated;
drop trigger if exists trg_notify_post_tag on public.post_tags;
create trigger trg_notify_post_tag after insert on public.post_tags for each row execute function public.notify_post_tag();

create or replace function public.respond_to_post_tag(_post_id uuid, _action text)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (select auth.uid()) is null or _action not in ('approved','declined') then raise exception 'Action invalide' using errcode='22023'; end if;
  update public.post_tags set status=_action, updated_at=now()
    where post_id=_post_id and tagged_user_id=(select auth.uid()) and status='pending';
end; $$;
revoke all on function public.respond_to_post_tag(uuid,text) from public;
revoke execute on function public.respond_to_post_tag(uuid,text) from anon;
grant execute on function public.respond_to_post_tag(uuid,text) to authenticated;

create or replace function public.respond_to_message_request(_conversation_id uuid, _action text)
returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (select auth.uid()) is null or _action not in ('accepted','declined') then raise exception 'Action invalide' using errcode='22023'; end if;
  update public.conversation_requests
    set status=_action, responded_at=now()
    where conversation_id=_conversation_id and recipient_id=(select auth.uid()) and status='pending';
  if not found then raise exception 'Demande introuvable' using errcode='P0002'; end if;
end; $$;
revoke all on function public.respond_to_message_request(uuid,text) from public;
revoke execute on function public.respond_to_message_request(uuid,text) from anon;
grant execute on function public.respond_to_message_request(uuid,text) to authenticated;

create or replace function public.open_or_create_direct_conversation(_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_conv uuid;
  created_conv uuid;
  lock_key text;
  recipient_permission text := 'everyone';
  recipient_follows_sender boolean := false;
  mutual_match boolean := false;
  requests_allowed boolean := true;
  needs_request boolean := false;
  existing_request_status text;
begin
  if current_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if _other_user_id is null or _other_user_id = current_user_id then raise exception 'Invalid target profile' using errcode = '22023'; end if;
  if not public.current_user_email_verified() then raise exception 'Email verification required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id=current_user_id and email_verified_at is not null and status='active') then raise exception 'Current profile is not active' using errcode='42501'; end if;
  if not exists (select 1 from public.profiles where id=_other_user_id and email_verified_at is not null and status='active') then raise exception 'Target profile not found' using errcode='P0002'; end if;
  if exists (select 1 from public.user_relationship_controls c where c.mode='blocked' and ((c.owner_id=current_user_id and c.target_id=_other_user_id) or (c.owner_id=_other_user_id and c.target_id=current_user_id))) then raise exception 'Ce compte n''est pas disponible.' using errcode='42501'; end if;

  lock_key := least(current_user_id::text,_other_user_id::text)||':'||greatest(current_user_id::text,_other_user_id::text);
  perform pg_advisory_xact_lock(hashtextextended(lock_key,0));

  select cp1.conversation_id into existing_conv
  from public.conversation_participants cp1 join public.conversation_participants cp2 on cp2.conversation_id=cp1.conversation_id
  where cp1.user_id=current_user_id and cp2.user_id=_other_user_id
    and (select count(*) from public.conversation_participants m where m.conversation_id=cp1.conversation_id)=2
  order by cp1.joined_at desc limit 1;
  if existing_conv is not null then
    select cr.status into existing_request_status from public.conversation_requests cr where cr.conversation_id=existing_conv;
    if existing_request_status='declined' and exists(select 1 from public.conversation_requests cr where cr.conversation_id=existing_conv and cr.sender_id=current_user_id) then
      raise exception 'Cette demande de message a été refusée.' using errcode='42501';
    end if;
    return existing_conv;
  end if;

  select coalesce(s.message_permission,'everyone'), coalesce(s.allow_message_requests,true)
    into recipient_permission, requests_allowed from public.user_settings s where s.user_id=_other_user_id;
  recipient_permission := coalesce(recipient_permission,'everyone'); requests_allowed := coalesce(requests_allowed,true);
  select exists(select 1 from public.follows f where f.follower_id=_other_user_id and f.following_id=current_user_id) into recipient_follows_sender;
  select exists(select 1 from public.match_likes a join public.match_likes b on b.from_user_id=a.to_user_id and b.to_user_id=a.from_user_id where a.from_user_id=current_user_id and a.to_user_id=_other_user_id) into mutual_match;

  if recipient_permission='nobody' then raise exception 'Cette personne n''accepte pas de nouveaux messages.' using errcode='42501';
  elsif recipient_permission='following' and not recipient_follows_sender and not mutual_match then raise exception 'Cette personne accepte les messages des comptes qu''elle suit.' using errcode='42501';
  elsif recipient_permission='matches' and not mutual_match then raise exception 'Un match Travel Match est nécessaire pour écrire à cette personne.' using errcode='42501';
  elsif recipient_permission='everyone' and not recipient_follows_sender and not mutual_match then
    if not requests_allowed then raise exception 'Cette personne n''accepte pas les demandes de messages.' using errcode='42501'; end if;
    needs_request := true;
  end if;

  insert into public.conversations default values returning id into created_conv;
  insert into public.conversation_participants (conversation_id,user_id) values (created_conv,current_user_id),(created_conv,_other_user_id) on conflict do nothing;
  if needs_request then insert into public.conversation_requests(conversation_id,sender_id,recipient_id) values(created_conv,current_user_id,_other_user_id); end if;
  return created_conv;
end; $$;
revoke all on function public.open_or_create_direct_conversation(uuid) from public;
revoke execute on function public.open_or_create_direct_conversation(uuid) from anon;
grant execute on function public.open_or_create_direct_conversation(uuid) to authenticated;

create or replace function public.enforce_direct_message_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  participant_count integer;
  other_user_id uuid;
  request_row public.conversation_requests%rowtype;
  prior_messages integer := 0;
begin
  select count(*) into participant_count from public.conversation_participants cp where cp.conversation_id=new.conversation_id;
  if participant_count <> 2 then return new; end if;
  select cp.user_id into other_user_id from public.conversation_participants cp where cp.conversation_id=new.conversation_id and cp.user_id<>new.sender_id limit 1;
  if other_user_id is not null and exists (select 1 from public.user_relationship_controls c where c.mode='blocked' and ((c.owner_id=new.sender_id and c.target_id=other_user_id) or (c.owner_id=other_user_id and c.target_id=new.sender_id))) then raise exception 'Impossible d''envoyer un message à ce compte.' using errcode='42501'; end if;

  select * into request_row from public.conversation_requests cr where cr.conversation_id=new.conversation_id;
  if found and request_row.status='pending' then
    if new.sender_id <> request_row.sender_id then raise exception 'Accepte d’abord la demande de message.' using errcode='42501'; end if;
    if new.attachment_type in ('rtc','call') then raise exception 'Les appels sont disponibles après acceptation de la demande.' using errcode='42501'; end if;
    select count(*) into prior_messages from public.messages m where m.conversation_id=new.conversation_id and m.sender_id=request_row.sender_id and coalesce(m.attachment_type,'')<>'rtc';
    if prior_messages >= 1 then raise exception 'Une seule invitation peut être envoyée avant acceptation.' using errcode='42501'; end if;
  elsif found and request_row.status='declined' then
    raise exception 'Cette demande de message a été refusée.' using errcode='42501';
  end if;
  return new;
end; $$;
revoke execute on function public.enforce_direct_message_block() from public, anon, authenticated;

create or replace function public.get_visible_stories()
returns table(id uuid,user_id uuid,media_url text,poster_url text,media_chunks text[],media_mime_type text,media_size_bytes bigint,media_type text,city text,country text,created_at timestamptz,expires_at timestamptz,username text,avatar_url text,story_group_id uuid,segment_index integer,segment_count integer,segment_start_seconds double precision,segment_end_seconds double precision,video_duration_seconds double precision)
language sql stable security definer set search_path=public,pg_temp as $$
  select visible.id,visible.user_id,visible.media_url,visible.poster_url,visible.media_chunks,visible.media_mime_type,visible.media_size_bytes,visible.media_type,visible.city,visible.country,visible.created_at,visible.expires_at,visible.username,visible.avatar_url,visible.story_group_id,visible.segment_index,visible.segment_count,visible.segment_start_seconds,visible.segment_end_seconds,visible.video_duration_seconds
  from (
    select s.id,s.user_id,s.media_url,s.poster_url,s.media_chunks,s.media_mime_type,s.media_size_bytes,s.media_type,s.city,s.country,s.created_at,s.expires_at,p.username,p.avatar_url,s.story_group_id,s.segment_index,s.segment_count,s.segment_start_seconds,s.segment_end_seconds,s.video_duration_seconds,max(s.created_at) over(partition by s.user_id) as user_latest_story_at
    from public.stories s join public.profiles p on p.id=s.user_id
    where (select auth.uid()) is not null and s.expires_at>now()
      and not exists(select 1 from public.user_relationship_controls c where c.mode='blocked' and ((c.owner_id=(select auth.uid()) and c.target_id=s.user_id) or (c.owner_id=s.user_id and c.target_id=(select auth.uid()))))
      and not exists(select 1 from public.story_hidden_accounts h where h.owner_id=s.user_id and h.target_id=(select auth.uid()))
      and not exists(select 1 from public.user_mutes m where m.owner_id=(select auth.uid()) and m.target_id=s.user_id and m.mute_stories=true)
      and (
        s.user_id=(select auth.uid()) or public.current_user_is_staff() or (
          exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=s.user_id)
          and (s.audience='followers' or exists(select 1 from public.close_friends cf where cf.owner_id=s.user_id and cf.friend_id=(select auth.uid())))
        )
      )
  ) visible
  order by visible.user_latest_story_at desc,visible.user_id,visible.created_at asc,coalesce(visible.story_group_id,visible.id),visible.segment_index asc,visible.id asc limit 300;
$$;
revoke all on function public.get_visible_stories() from public;
revoke execute on function public.get_visible_stories() from anon;
grant execute on function public.get_visible_stories() to authenticated;

drop policy if exists "stories visible to owner followers and staff" on public.stories;
drop policy if exists "stories visible with audience controls" on public.stories;
create policy "stories visible with audience controls" on public.stories for select to authenticated using (
  expires_at>now()
  and not exists(select 1 from public.user_relationship_controls c where c.mode='blocked' and ((c.owner_id=(select auth.uid()) and c.target_id=stories.user_id) or (c.owner_id=stories.user_id and c.target_id=(select auth.uid()))))
  and not exists(select 1 from public.story_hidden_accounts h where h.owner_id=stories.user_id and h.target_id=(select auth.uid()))
  and not exists(select 1 from public.user_mutes m where m.owner_id=(select auth.uid()) and m.target_id=stories.user_id and m.mute_stories=true)
  and (
    user_id=(select auth.uid()) or private.current_user_is_staff() or (
      exists(select 1 from public.follows f where f.follower_id=(select auth.uid()) and f.following_id=stories.user_id)
      and (audience='followers' or exists(select 1 from public.close_friends cf where cf.owner_id=stories.user_id and cf.friend_id=(select auth.uid())))
    )
  )
);