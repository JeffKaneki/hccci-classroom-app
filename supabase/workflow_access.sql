create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles are viewable by owner or admin" on public.profiles;
create policy "profiles are viewable by owner or admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage classrooms" on public.classrooms;
create policy "admins manage classrooms" on public.classrooms
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage schedules" on public.recurring_schedules;
create policy "admins manage schedules" on public.recurring_schedules
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage exceptions" on public.schedule_exceptions;
create policy "admins manage exceptions" on public.schedule_exceptions
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage room blocks" on public.room_blocks;
create policy "admins manage room blocks" on public.room_blocks
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "reservations readable by authenticated users" on public.reservations;
drop policy if exists "admins manage reservations" on public.reservations;
drop policy if exists "users create own reservation requests" on public.reservations;
drop policy if exists "users read own reservations" on public.reservations;
drop policy if exists "authenticated read approved reservations" on public.reservations;
create policy "users read own reservations" on public.reservations
  for select using (auth.uid() = created_by or public.is_admin());
create policy "authenticated read approved reservations" on public.reservations
  for select using (auth.role() = 'authenticated' and status = 'approved');
create policy "users create own reservation requests" on public.reservations
  for insert with check (
    auth.uid() = created_by
    and status = 'pending'
    and exists (select 1 from public.classrooms c where c.id = classroom_id and c.active)
  );
create policy "admins manage reservations" on public.reservations
  for all using (public.is_admin())
  with check (public.is_admin());

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

create or replace function public.cancel_own_reservation(target_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = target_reservation_id
    and created_by = auth.uid()
    and status = 'pending';

  get diagnostics changed_rows = row_count;
  if changed_rows = 0 then
    raise exception 'Only your pending reservations can be cancelled.';
  end if;
end;
$$;

revoke all on function public.cancel_own_reservation(uuid) from public, anon;
grant execute on function public.cancel_own_reservation(uuid) to authenticated;

drop policy if exists "reports create by authenticated users" on public.reports;
drop policy if exists "reports readable by authenticated users" on public.reports;
drop policy if exists "reports create own" on public.reports;
drop policy if exists "reports readable by owner or admin" on public.reports;
drop policy if exists "admins manage reports" on public.reports;
create policy "reports create own" on public.reports
  for insert with check (
    auth.uid() = created_by
    and status = 'new'
  );
create policy "reports readable by owner or admin" on public.reports
  for select using (auth.uid() = created_by or public.is_admin());
create policy "admins manage reports" on public.reports
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "audit logs readable by admins only" on public.audit_logs;
drop policy if exists "audit logs insert by admins only" on public.audit_logs;
create policy "audit logs readable by admins only" on public.audit_logs
  for select using (public.is_admin());
create policy "audit logs insert by admins only" on public.audit_logs
  for insert with check (public.is_admin());
