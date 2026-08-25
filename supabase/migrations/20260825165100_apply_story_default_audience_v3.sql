create or replace function public.apply_story_default_audience()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select coalesce(s.story_default_audience, 'followers')
  into new.audience
  from public.user_settings s
  where s.user_id = new.user_id;
  new.audience := coalesce(new.audience, 'followers');
  return new;
end;
$$;
revoke execute on function public.apply_story_default_audience() from public, anon, authenticated;
drop trigger if exists trg_apply_story_default_audience on public.stories;
create trigger trg_apply_story_default_audience
before insert on public.stories
for each row execute function public.apply_story_default_audience();