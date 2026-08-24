-- GLOBELINK V10.8.7
-- Copie tout ce fichier dans Supabase > SQL Editor > New query, puis clique sur Run.
-- Cette opération rend l'analyse IA des lieux invisible aux utilisateurs.

begin;

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

grant select on table public.places to service_role;

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
