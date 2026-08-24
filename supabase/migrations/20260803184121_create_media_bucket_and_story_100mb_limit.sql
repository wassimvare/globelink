insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Media authenticated upload" on storage.objects;
create policy "Media authenticated upload" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Media owner update" on storage.objects;
create policy "Media owner update" on storage.objects
for update to authenticated
using (bucket_id = 'media' and owner_id = auth.uid()::text)
with check (bucket_id = 'media' and owner_id = auth.uid()::text);

drop policy if exists "Media owner delete" on storage.objects;
create policy "Media owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'media' and owner_id = auth.uid()::text);
