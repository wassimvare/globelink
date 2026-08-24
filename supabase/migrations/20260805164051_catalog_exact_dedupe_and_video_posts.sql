with ranked as (
  select
    id,
    row_number() over (
      partition by
        kind,
        lower(regexp_replace(trim(title), '[^[:alnum:]]+', '', 'g')),
        round(latitude::numeric, 5),
        round(longitude::numeric, 5)
      order by
        (image_url is not null) desc,
        (booking_url is not null) desc,
        fetched_at desc,
        id desc
    ) as duplicate_rank
  from public.external_catalog_items
  where published = true
    and admin_hidden = false
    and latitude is not null
    and longitude is not null
    and nullif(trim(title), '') is not null
    and kind in ('activity', 'restaurant', 'hotel')
)
update public.external_catalog_items item
set admin_hidden = true,
    hidden_reason = 'Doublon exact masqué automatiquement',
    hidden_at = now()
from ranked
where item.id = ranked.id
  and ranked.duplicate_rank > 1;

create index if not exists external_catalog_homepage_idx
  on public.external_catalog_items (kind, fetched_at desc)
  where published = true and admin_hidden = false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.posts'::regclass
      and conname = 'posts_video_url_safe'
  ) then
    alter table public.posts
      add constraint posts_video_url_safe check (
        video_url is null
        or char_length(video_url) between 1 and 1200
      ) not valid;
  end if;
end $$;
