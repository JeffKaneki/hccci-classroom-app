do $$
declare
  table_to_publish text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime does not exist in this project.';
  end if;

  foreach table_to_publish in array array[
    'classrooms',
    'recurring_schedules',
    'schedule_exceptions',
    'room_blocks',
    'reservations',
    'reports'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_to_publish
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_to_publish);
    end if;
  end loop;
end;
$$;
