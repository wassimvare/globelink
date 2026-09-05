-- Keep the catalog-media cron compatible with publishable API keys by sending
-- both Authorization and apikey headers. This mirrors the migration already
-- applied to the production Supabase project.

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

  select jobid into v_job_id
    from cron.job
    where jobname = 'globelink-daily-catalog-media'
    limit 1;
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

select public.configure_catalog_media_daily_cron();
