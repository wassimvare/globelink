-- GlobeLink V10.4: tighten media Storage policies.
--
-- The media bucket stays private. Public posts/avatars still display, but
-- stories, direct-message attachments and trip media are no longer covered by
-- a broad "read everything in media" policy.

begin;

update storage.buckets
set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
where id = 'media';

drop policy if exists "Media public read" on storage.objects;
drop policy if exists "Media public read public folders" on storage.objects;
drop policy if exists "Media authenticated read private folders" on storage.objects;
drop policy if exists "Media authenticated upload" on storage.objects;
drop policy if exists "Media owner update" on storage.objects;
drop policy if exists "Media owner delete" on storage.objects;

-- Public-facing media only. This keeps the feed/profile/catalog usable without
-- exposing stories, DMs or personal trip media by default.
create policy "Media public read public folders"
on storage.objects for select to public
using (
  bucket_id = 'media'
  and (storage.foldername(name))[2] in (
    'avatars',
    'banners',
    'posts',
    'places',
    'marketplace'
  )
);

-- Authenticated users can read their own files, visible stories, and DM
-- attachments only when they belong to a conversation they participate in.
create policy "Media authenticated read private folders"
on storage.objects for select to authenticated
using (
  bucket_id = 'media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.stories s
      where s.expires_at > now()
        and (
          s.media_url = storage.objects.name
          or s.poster_url = storage.objects.name
          or storage.objects.name = any(coalesce(s.media_chunks, array[]::text[]))
        )
        and (
          s.user_id = (select auth.uid())
          or private.current_user_is_staff()
          or exists (
            select 1
            from public.follows f
            where f.follower_id = (select auth.uid())
              and f.following_id = s.user_id
          )
        )
    )
    or exists (
      select 1
      from public.messages m
      where m.attachment_url = storage.objects.name
        and private.is_conversation_participant(m.conversation_id, (select auth.uid()))
    )
  )
);

-- Do not rely on the browser-side folder whitelist only. A modified client can
-- call Storage directly, so Storage itself must also validate the path.
create policy "Media authenticated upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] in (
    'stories',
    'posts',
    'avatars',
    'banners',
    'places',
    'marketplace',
    'trips',
    'dm'
  )
  and lower(storage.extension(name)) in (
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'mp4',
    'webm',
    'mov'
  )
);

create policy "Media owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'media'
  and (
    owner_id = (select auth.uid())::text
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
)
with check (
  bucket_id = 'media'
  and (
    owner_id = (select auth.uid())::text
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
  and (storage.foldername(name))[2] in (
    'stories',
    'posts',
    'avatars',
    'banners',
    'places',
    'marketplace',
    'trips',
    'dm'
  )
);

create policy "Media owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'media'
  and (
    owner_id = (select auth.uid())::text
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

commit;
