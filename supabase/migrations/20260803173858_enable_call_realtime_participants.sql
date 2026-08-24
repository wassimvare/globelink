-- Cette migration est déjà appliquée sur le projet Supabase distant.
-- Le fichier local doit conserver exactement le même numéro de version
-- afin que la CLI Supabase puisse comparer correctement les historiques.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end $$;
