with ranked as (
  select id,
         row_number() over (
           partition by trip_id, visited_on, title
           order by updated_at desc nulls last, created_at desc, id desc
         ) as rn
  from public.trip_entries
  where title like 'Carnet · Choix · %'
)
delete from public.trip_entries e
using ranked r
where e.id = r.id and r.rn > 1;

create unique index if not exists trip_entries_one_program_selection_per_section
  on public.trip_entries (trip_id, visited_on, title)
  where title like 'Carnet · Choix · %';
