-- GlobeLink — catalogue local-first et cache photo réutilisable.
-- Les données Google Places ne sont jamais copiées dans ce cache.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-media',
  'catalog-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.preserve_cached_catalog_image()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_path text;
begin
  if old.provider <> 'openstreetmap' then
    return new;
  end if;

  old_path := old.tags ->> 'catalog_image_storage_path';
  if coalesce(old_path, '') = '' then
    return new;
  end if;

  if new.image_url is null
     or new.image_url not like '%/storage/v1/object/public/catalog-media/%' then
    new.image_url := old.image_url;
  end if;

  new.tags := coalesce(new.tags, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'catalog_image_storage_path', old.tags ->> 'catalog_image_storage_path',
    'catalog_image_source', old.tags ->> 'catalog_image_source',
    'catalog_image_source_url', old.tags ->> 'catalog_image_source_url',
    'catalog_image_license', old.tags ->> 'catalog_image_license',
    'catalog_image_license_url', old.tags ->> 'catalog_image_license_url',
    'catalog_image_attribution', old.tags ->> 'catalog_image_attribution',
    'catalog_image_cached_at', old.tags ->> 'catalog_image_cached_at',
    'catalog_image_status', old.tags ->> 'catalog_image_status'
  ));
  return new;
end;
$$;

drop trigger if exists preserve_cached_catalog_image_before_update on public.external_catalog_items;
create trigger preserve_cached_catalog_image_before_update
before update on public.external_catalog_items
for each row execute function public.preserve_cached_catalog_image();

-- Stable open-data POIs become GlobeLink's persistent catalogue. Short-lived
-- commercial offers and provider data keep their existing expiry behaviour.
create or replace function public.cleanup_stale_external_catalog()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.external_catalog_items
   where admin_hidden = false
     and (
       (kind = 'deal' and coalesce(valid_until, fetched_at + interval '2 days') < now())
       or (
         kind <> 'deal'
         and provider not in ('openstreetmap', 'wikidata-public', 'globelink-curated')
         and fetched_at < now() - interval '45 days'
       )
     );
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.cleanup_stale_external_catalog() from public, anon, authenticated;
grant execute on function public.cleanup_stale_external_catalog() to service_role;

create or replace function public.get_catalog_media_candidates(p_limit integer default 60)
returns table (
  id uuid,
  external_id text,
  title text,
  tags jsonb,
  image_url text,
  fetched_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.external_id, e.title, e.tags, e.image_url, e.fetched_at
  from public.external_catalog_items e
  where e.provider = 'openstreetmap'
    and e.kind in ('activity','restaurant','hotel')
    and e.published = true
    and e.admin_hidden = false
    and coalesce(e.tags ->> 'catalog_image_storage_path', '') = ''
    and (
      coalesce(e.tags ->> 'wikimedia_commons', '') <> ''
      or coalesce(e.tags ->> 'wikidata', '') <> ''
      or coalesce(e.tags ->> 'wikipedia', '') <> ''
    )
    and (
      coalesce(e.tags ->> 'catalog_image_attempted_at', '') = ''
      or nullif(e.tags ->> 'catalog_image_attempted_at', '')::timestamptz < now() - interval '30 days'
    )
  order by
    case when coalesce(e.tags ->> 'wikimedia_commons', '') <> '' then 0 else 1 end,
    e.fetched_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 150);
$$;
revoke all on function public.get_catalog_media_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_catalog_media_candidates(integer) to service_role;

create or replace function public.configure_catalog_media_daily_cron(p_schedule text default '45 4 * * *')
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, cron, net
as $$
declare
  v_job_id bigint;
  v_project_url text;
  v_publishable_key text;
  v_sync_secret text;
  v_command text;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'service role required';
  end if;
  if p_schedule <> '45 4 * * *' then
    raise exception 'only the fixed daily schedule is allowed';
  end if;

  select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'globelink_catalog_project_url' limit 1;
  select decrypted_secret into v_publishable_key
    from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key' limit 1;
  select decrypted_secret into v_sync_secret
    from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret' limit 1;

  if coalesce(v_project_url, '') = '' or coalesce(v_publishable_key, '') = '' or coalesce(v_sync_secret, '') = '' then
    raise exception 'catalog cron secrets are not configured yet';
  end if;

  select jobid into v_job_id from cron.job where jobname = 'globelink-daily-catalog-media' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_command := format(
    'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);',
    v_project_url || '/functions/v1/cache-catalog-media',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_publishable_key,
      'apikey', v_publishable_key,
      'x-catalog-sync-secret', v_sync_secret
    )::text,
    jsonb_build_object('limit', 60, 'triggerSource', 'cron')::text
  );

  select cron.schedule('globelink-daily-catalog-media', p_schedule, v_command) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_catalog_media_daily_cron(text) from public, anon, authenticated;
grant execute on function public.configure_catalog_media_daily_cron(text) to service_role;
