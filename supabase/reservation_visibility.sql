-- Run this migration if approved reservations are visible to admins but not regular users.

alter table public.reservations enable row level security;

drop policy if exists "reservations readable by authenticated users" on public.reservations;
drop policy if exists "authenticated read approved reservations" on public.reservations;
create policy "authenticated read approved reservations" on public.reservations
  for select
  using (auth.role() = 'authenticated' and status = 'approved');

create or replace function public.get_approved_reservations(week_start timestamptz)
returns setof public.reservations
language sql
stable
security definer
set search_path = public
as $$
  select reservations.*
  from public.reservations
  where auth.role() = 'authenticated'
    and reservations.status = 'approved'
    and reservations.ends_at >= week_start
  order by reservations.starts_at;
$$;

revoke all on function public.get_approved_reservations(timestamptz) from public, anon;
grant execute on function public.get_approved_reservations(timestamptz) to authenticated;
