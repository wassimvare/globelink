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
  if filter_offensive and lower(coalesce(new.content,'')) ~ '(\mconnard\M|\mconnasse\M|\msalope\M|\mpute\M|\mencul[eé]\M|\mfdp\M|\mfuck[ ]+you\M|\mbitch\M)' then
    raise exception 'Ce commentaire a été filtré comme potentiellement offensant.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_comment_permissions() from public, anon, authenticated;