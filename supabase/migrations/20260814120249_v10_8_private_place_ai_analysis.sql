-- GlobeLink V10.8.7: AI place-analysis details are admin-only.
-- Owners still see their submission status and the final human rejection reason.

begin;

-- RLS controls rows, not columns. Remove the broad SELECT grant first, then
-- expose only the columns needed by public pages and the owner's status page.
revoke select on table public.places from public, anon, authenticated;

grant select (
  id,
  name,
  category,
  country,
  city,
  lat,
  lng,
  description,
  image_url,
  created_at,
  moderation_status,
  moderation_reviewed_at,
  moderation_rejection_reason
) on table public.places to anon, authenticated;

-- Trusted server functions need the complete row for the private AI review.
grant select on table public.places to service_role;

-- A WAL Postgres Changes payload can contain the changed row. The status page
-- now polls its safe server response, so places must not be in Realtime.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'places'
  ) then
    alter publication supabase_realtime drop table public.places;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
