create or replace function public.enforce_comment_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_user_id uuid;
  comments_allowed boolean := true;
begin
  if current_user_id is null or new.user_id <> current_user_id then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.user_id into target_user_id
  from public.posts p
  where p.id = new.post_id;

  if target_user_id is null then
    raise exception 'Publication introuvable' using errcode = 'P0002';
  end if;

  if target_user_id = current_user_id then
    return new;
  end if;

  if exists (
    select 1 from public.user_relationship_controls c
    where c.mode = 'blocked'
      and ((c.owner_id = current_user_id and c.target_id = target_user_id)
        or (c.owner_id = target_user_id and c.target_id = current_user_id))
  ) then
    raise exception 'Interaction impossible avec ce compte.' using errcode = '42501';
  end if;

  select coalesce(s.allow_comments, true)
  into comments_allowed
  from public.user_settings s
  where s.user_id = target_user_id;
  comments_allowed := coalesce(comments_allowed, true);

  if not comments_allowed then
    raise exception 'Les commentaires sont désactivés pour cette publication.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_comment_permissions() from public, anon, authenticated;

drop trigger if exists comments_permissions_guard on public.comments;
create trigger comments_permissions_guard
before insert on public.comments
for each row execute function public.enforce_comment_permissions();
