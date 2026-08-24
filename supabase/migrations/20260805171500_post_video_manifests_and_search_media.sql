alter table public.post_media
  add column if not exists media_chunks text[],
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.post_media'::regclass
      and conname = 'post_media_manifest_safe'
  ) then
    alter table public.post_media
      add constraint post_media_manifest_safe check (
        media_chunks is null
        or (
          media_type in ('video', 'reel')
          and cardinality(media_chunks) between 1 and 128
          and media_chunks[1] = url
          and media_mime_type in ('video/mp4', 'video/webm', 'video/quicktime')
          and media_size_bytes is not null
          and media_size_bytes > 0
        )
      ) not valid;
  end if;
end $$;

create index if not exists post_media_manifest_idx
  on public.post_media ((media_chunks is not null), post_id, position);
