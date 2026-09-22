-- Support self-hosted HTTPS origins and private Docker gateways.
-- Configuration remains service-role only; no anonymous/authenticated execution.
create or replace function public.configure_catalog_daily_cron(
  p_project_url text,
  p_publishable_key text,
  p_sync_secret text,
  p_schedule text default '15 4 * * *'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault, cron, net
as $$
declare
  v_id uuid;
  v_job_id bigint;
  v_command text;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'service role required';
  end if;
  if p_project_url !~ '^https?://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$' then
    raise exception 'invalid project url';
  end if;
  if char_length(p_publishable_key) < 20 or char_length(p_sync_secret) < 24 then
    raise exception 'invalid secret material';
  end if;
  if p_schedule <> '15 4 * * *' then
    raise exception 'only the fixed daily schedule is allowed';
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_project_url' limit 1;
  if v_id is null then
    perform vault.create_secret(p_project_url, 'globelink_catalog_project_url', 'GlobeLink daily catalog project URL');
  else
    perform vault.update_secret(v_id, p_project_url, 'globelink_catalog_project_url', 'GlobeLink daily catalog project URL');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key' limit 1;
  if v_id is null then
    perform vault.create_secret(p_publishable_key, 'globelink_catalog_publishable_key', 'GlobeLink daily catalog publishable key');
  else
    perform vault.update_secret(v_id, p_publishable_key, 'globelink_catalog_publishable_key', 'GlobeLink daily catalog publishable key');
  end if;

  select id into v_id from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(p_sync_secret, 'globelink_catalog_sync_secret', 'GlobeLink daily catalog synchronization secret');
  else
    perform vault.update_secret(v_id, p_sync_secret, 'globelink_catalog_sync_secret', 'GlobeLink daily catalog synchronization secret');
  end if;

  select jobid into v_job_id from cron.job where jobname = 'globelink-daily-catalog' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  v_command := $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_project_url') || '/functions/v1/sync-travel-catalog',
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', case when (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key') like 'eyJ%' then 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key') else null end,
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key'),
        'x-catalog-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret')
      )),
      body := jsonb_build_object('triggerSource', 'cron'),
      timeout_milliseconds := 120000
    ) as request_id;
  $command$;

  select cron.schedule('globelink-daily-catalog', p_schedule, v_command) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_catalog_daily_cron(text, text, text, text) from public, anon, authenticated;
grant execute on function public.configure_catalog_daily_cron(text, text, text, text) to service_role;

create or replace function public.configure_catalog_media_daily_cron(p_schedule text default '45 4 * * *')
returns bigint language plpgsql security definer
set search_path = public, extensions, vault, cron, net
as $$
declare v_job_id bigint; v_command text;
begin
  if p_schedule <> '45 4 * * *' then raise exception 'only the fixed daily schedule is allowed'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret') then raise exception 'configure catalog cron first'; end if;
  select jobid into v_job_id from cron.job where jobname = 'globelink-daily-catalog-media' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  v_command := $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_project_url') || '/functions/v1/cache-catalog-media',
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key'),
        'Authorization', case when (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key') like 'eyJ%' then 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_publishable_key') else null end,
        'x-catalog-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'globelink_catalog_sync_secret')
      )),
      body := jsonb_build_object('limit', 60, 'triggerSource', 'cron'),
      timeout_milliseconds := 120000
    );
  $command$;
  select cron.schedule('globelink-daily-catalog-media', p_schedule, v_command) into v_job_id;
  return v_job_id;
end;
$$;
revoke all on function public.configure_catalog_media_daily_cron(text) from public, anon, authenticated;
grant execute on function public.configure_catalog_media_daily_cron(text) to service_role;

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
      or nullif(e.tags ->> 'catalog_image_attempted_at', '')::timestamptz < now() - case when e.tags ->> 'catalog_image_status' = 'error' then interval '1 hour' else interval '30 days' end
    )
  order by
    case when coalesce(e.tags ->> 'wikimedia_commons', '') <> '' then 0 else 1 end,
    e.fetched_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 150);
$$;
revoke all on function public.get_catalog_media_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_catalog_media_candidates(integer) to service_role;
