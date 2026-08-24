-- Additional integrity protection for user-generated content.
-- The API validates inputs for UX; these database checks are the final line of defense.

create or replace function public.prevent_protected_column_changes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  column_name text;
begin
  if auth.role() = 'service_role' then return new; end if;
  foreach column_name in array tg_argv loop
    if (to_jsonb(old) -> column_name) is distinct from (to_jsonb(new) -> column_name) then
      raise exception 'protected column cannot be changed: %', column_name using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.prevent_protected_column_changes() from public;

-- Compatibility: the application already uses these travel-journal fields,
-- but some historical database snapshots did not create them. Add them before
-- the integrity constraints so a fresh or upgraded Supabase project can migrate.
alter table if exists public.trips
  add column if not exists summary text,
  add column if not exists stats jsonb,
  add column if not exists finalized_at timestamptz,
  add column if not exists souvenir_url text;

do $$ begin
  if to_regclass('public.posts') is not null then
    drop trigger if exists protect_posts_identity on public.posts;
    create trigger protect_posts_identity before update on public.posts
      for each row execute function public.prevent_protected_column_changes('id','user_id','created_at');
  end if;
  if to_regclass('public.stories') is not null then
    drop trigger if exists protect_stories_identity on public.stories;
    create trigger protect_stories_identity before update on public.stories
      for each row execute function public.prevent_protected_column_changes('id','user_id','created_at');
  end if;
  if to_regclass('public.comments') is not null then
    drop trigger if exists protect_comments_identity on public.comments;
    create trigger protect_comments_identity before update on public.comments
      for each row execute function public.prevent_protected_column_changes('id','user_id','post_id','parent_id','created_at');
  end if;
  if to_regclass('public.messages') is not null then
    drop trigger if exists protect_messages_identity on public.messages;
    create trigger protect_messages_identity before update on public.messages
      for each row execute function public.prevent_protected_column_changes('id','sender_id','conversation_id','created_at');
  end if;
  if to_regclass('public.places') is not null then
    drop trigger if exists protect_places_identity on public.places;
    create trigger protect_places_identity before update on public.places
      for each row execute function public.prevent_protected_column_changes('id','user_id','created_at');
  end if;
  if to_regclass('public.trips') is not null then
    drop trigger if exists protect_trips_identity on public.trips;
    create trigger protect_trips_identity before update on public.trips
      for each row execute function public.prevent_protected_column_changes('id','user_id','created_at');
  end if;
  if to_regclass('public.products') is not null then
    drop trigger if exists protect_products_identity on public.products;
    create trigger protect_products_identity before update on public.products
      for each row execute function public.prevent_protected_column_changes('id','seller_id','created_at');
  end if;
  if to_regclass('public.reports') is not null then
    drop trigger if exists protect_reports_identity on public.reports;
    create trigger protect_reports_identity before update on public.reports
      for each row execute function public.prevent_protected_column_changes('id','reporter_id','target_id','target_type','created_at');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_counts_nonnegative') then
    alter table public.profiles add constraint profiles_counts_nonnegative
      check (followers_count >= 0 and following_count >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_links_safe') then
    alter table public.profiles add constraint profiles_links_safe check (
      char_length(coalesce(website_url,'')) <= 500
      and char_length(coalesce(instagram,'')) <= 80
      and char_length(coalesce(tiktok,'')) <= 80
      and char_length(coalesce(x_handle,'')) <= 80
      and char_length(coalesce(youtube,'')) <= 500
      and cardinality(coalesce(interests, array[]::text[])) <= 30
      and cardinality(coalesce(languages, array[]::text[])) <= 20
      and cardinality(coalesce(visited_countries, array[]::text[])) <= 250
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'post_media_safe') then
    alter table public.post_media add constraint post_media_safe check (
      media_type in ('image','video')
      and position between 0 and 20
      and char_length(url) between 1 and 1200
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_payload_safe') then
    alter table public.messages add constraint messages_payload_safe check (
      (nullif(btrim(coalesce(content,'')), '') is not null or attachment_url is not null)
      and char_length(coalesce(content,'')) <= 5000
      and char_length(coalesce(attachment_url,'')) <= 1200
      and (attachment_type is null or attachment_type in ('image','video','file','audio'))
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_values_safe') then
    alter table public.products add constraint products_values_safe check (
      char_length(btrim(title)) between 2 and 160
      and char_length(coalesce(description,'')) <= 8000
      and char_length(currency) between 3 and 3
      and price_cents between 0 and 100000000
      and rating_avg between 0 and 5
      and rating_count >= 0
      and favorites_count >= 0
      and cardinality(coalesce(tags, array[]::text[])) <= 30
      and char_length(coalesce(external_url,'')) <= 1200
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trips_values_safe') then
    alter table public.trips add constraint trips_values_safe check (
      char_length(btrim(title)) between 2 and 180
      and char_length(country) between 1 and 100
      and char_length(coalesce(city,'')) <= 120
      and char_length(coalesce(notes,'')) <= 50000
      and char_length(coalesce(summary,'')) <= 50000
      and (budget is null or budget between 0 and 10000000)
      and (starts_on is null or ends_on is null or ends_on >= starts_on)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_questions_safe') then
    alter table public.community_questions add constraint community_questions_safe check (
      char_length(btrim(title)) between 5 and 500
      and char_length(coalesce(body,'')) <= 10000
      and char_length(country) between 1 and 100
      and char_length(slug) between 3 and 180
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and votes >= 0
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'community_answers_safe') then
    alter table public.community_answers add constraint community_answers_safe
      check (char_length(btrim(content)) between 2 and 5000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'follows_not_self') then
    alter table public.follows add constraint follows_not_self check (follower_id <> following_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_likes_not_self') then
    alter table public.match_likes add constraint match_likes_not_self check (from_user_id <> to_user_id) not valid;
  end if;
end $$;

create index if not exists comments_post_created_idx on public.comments(post_id, created_at);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index if not exists places_country_city_idx on public.places(country, city);
create index if not exists products_published_created_idx on public.products(is_published, created_at desc) where is_published;
create index if not exists community_questions_country_created_idx on public.community_questions(country, created_at desc);
create index if not exists community_answers_question_created_idx on public.community_answers(question_id, created_at);

-- Reduce the blast radius of accidental grants. Service role keeps full access.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
