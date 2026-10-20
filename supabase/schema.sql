create extension if not exists pgcrypto;

create type public.user_role as enum ('user','admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'user',
  avatar_url text,
  notification_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null,
  name text not null,
  building text not null,
  floor text not null,
  description text,
  capacity integer not null check (capacity > 0),
  amenities text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building, room_number)
);

create table if not exists public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title text not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time text not null check (start_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'),
  effective_start date not null,
  effective_end date,
  enabled boolean not null default true,
  term text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  schedule_id uuid references public.recurring_schedules (id) on delete cascade,
  exception_date date not null,
  type text not null check (type in ('cancelled','modified','holiday','special_appointment')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_blocks (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title text not null,
  reason text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid references public.classrooms (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  report_type text not null,
  details text not null,
  status text not null default 'new' check (status in ('new','in_review','resolved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists classrooms_active_idx on public.classrooms (active);
create index if not exists recurring_schedules_classroom_id_idx on public.recurring_schedules (classroom_id);
create index if not exists room_blocks_classroom_idx on public.room_blocks (classroom_id, starts_at, ends_at);
create index if not exists reservations_classroom_idx on public.reservations (classroom_id, starts_at, ends_at, status);
create index if not exists reports_status_idx on public.reports (status);

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.recurring_schedules enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.room_blocks enable row level security;
alter table public.reservations enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "profiles are viewable by owner or admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = 'user');

create policy "admins manage profiles" on public.profiles
  for update using (public.is_admin())
  with check (public.is_admin());

create policy "public profile insert for authenticated users" on public.profiles
  for insert with check (auth.uid() = id and role = 'user');

create policy "classrooms readable by authenticated users" on public.classrooms
  for select using (auth.role() = 'authenticated');

create policy "admins manage classrooms" on public.classrooms
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "schedules readable by authenticated users" on public.recurring_schedules
  for select using (auth.role() = 'authenticated');

create policy "admins manage schedules" on public.recurring_schedules
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "exceptions readable by authenticated users" on public.schedule_exceptions
  for select using (auth.role() = 'authenticated');

create policy "admins manage exceptions" on public.schedule_exceptions
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "room blocks readable by authenticated users" on public.room_blocks
  for select using (auth.role() = 'authenticated');

create policy "admins manage room blocks" on public.room_blocks
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "users read own reservations" on public.reservations
  for select using (auth.uid() = created_by or public.is_admin());
create policy "authenticated read approved reservations" on public.reservations
  for select using (auth.role() = 'authenticated' and status = 'approved');
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

drop policy if exists "reports create by authenticated users" on public.reports;
drop policy if exists "reports readable by authenticated users" on public.reports;
create policy "reports create own" on public.reports
  for insert with check (auth.uid() = created_by and status = 'new');
create policy "reports readable by owner or admin" on public.reports
  for select using (auth.uid() = created_by or public.is_admin());

create policy "admins manage reports" on public.reports
  for update using (public.is_admin())
  with check (public.is_admin());

create policy "audit logs readable by admins only" on public.audit_logs
  for select using (public.is_admin());

create policy "audit logs insert by admins only" on public.audit_logs
  for insert with check (public.is_admin());

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

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@]+@hccci\.edu\.ph$' then
    raise exception 'Registration is limited to email addresses ending in @hccci.edu.ph.';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'User'),
    new.email,
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_profile();

create or replace function public.prevent_admin_self_assignment()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin'
    and old.role <> 'admin'
    and current_setting('app.allow_admin_assignment', true) is distinct from 'on' then
    raise exception 'Administrators must be assigned through a trusted server-side process.';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_admin_self_assignment
  before update on public.profiles
  for each row
  execute procedure public.prevent_admin_self_assignment();

create or replace function public.assign_first_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  lock table public.profiles in share row exclusive mode;

  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An administrator has already been assigned.';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'No profile exists for the requested user.';
  end if;

  perform set_config('app.allow_admin_assignment', 'on', true);

  update public.profiles
  set role = 'admin'
  where id = target_user_id;
end;
$$;

revoke all on function public.assign_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.assign_first_admin(uuid) to service_role;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger classrooms_updated_at
before update on public.classrooms
for each row execute procedure public.update_updated_at_column();

create trigger schedules_updated_at
before update on public.recurring_schedules
for each row execute procedure public.update_updated_at_column();

create trigger exceptions_updated_at
before update on public.schedule_exceptions
for each row execute procedure public.update_updated_at_column();

create trigger room_blocks_updated_at
before update on public.room_blocks
for each row execute procedure public.update_updated_at_column();

create trigger reservations_updated_at
before update on public.reservations
for each row execute procedure public.update_updated_at_column();

create trigger reports_updated_at
before update on public.reports
for each row execute procedure public.update_updated_at_column();

create or replace function public.room_time_conflict(
  target_classroom_id uuid,
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  excluded_reservation_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_title text;
  first_day date;
  last_day date;
  day_offset integer;
  occurrence_date date;
begin
  if proposed_ends_at <= proposed_starts_at then
    raise exception 'Reservation end must be after its start.';
  end if;

  select title into conflict_title
  from public.room_blocks
  where classroom_id = target_classroom_id
    and starts_at < proposed_ends_at
    and ends_at > proposed_starts_at
  limit 1;
  if conflict_title is not null then
    return format('Room block: %s', conflict_title);
  end if;

  select title into conflict_title
  from public.reservations
  where classroom_id = target_classroom_id
    and status = 'approved'
    and (excluded_reservation_id is null or id <> excluded_reservation_id)
    and starts_at < proposed_ends_at
    and ends_at > proposed_starts_at
  limit 1;
  if conflict_title is not null then
    return format('Approved reservation: %s', conflict_title);
  end if;

  first_day := (proposed_starts_at at time zone 'Asia/Manila')::date;
  last_day := ((proposed_ends_at - interval '1 microsecond') at time zone 'Asia/Manila')::date;

  for day_offset in 0..(last_day - first_day) loop
    occurrence_date := first_day + day_offset;
    select schedule.title into conflict_title
    from public.recurring_schedules as schedule
    where schedule.classroom_id = target_classroom_id
      and schedule.enabled
      and schedule.day_of_week = extract(dow from occurrence_date)::integer
      and occurrence_date >= schedule.effective_start
      and (schedule.effective_end is null or occurrence_date <= schedule.effective_end)
      and not exists (
        select 1
        from public.schedule_exceptions as exception
        where exception.classroom_id = target_classroom_id
          and exception.exception_date = occurrence_date
          and (exception.schedule_id is null or exception.schedule_id = schedule.id)
          and exception.type in ('cancelled', 'holiday')
      )
      and (occurrence_date + schedule.start_time::time) at time zone 'Asia/Manila' < proposed_ends_at
      and (
        occurrence_date
          + schedule.end_time::time
          + case when schedule.end_time::time <= schedule.start_time::time then interval '1 day' else interval '0' end
      ) at time zone 'Asia/Manila' > proposed_starts_at
    limit 1;

    if conflict_title is not null then
      return format('Recurring schedule: %s', conflict_title);
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.room_time_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.request_room_reservation(
  target_classroom_id uuid,
  request_title text,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid := auth.uid();
  conflict text;
  reservation_id uuid;
begin
  if requester_id is null then
    raise exception 'Sign in before requesting a room.';
  end if;
  if nullif(btrim(request_title), '') is null then
    raise exception 'Enter a reservation purpose.';
  end if;
  if requested_starts_at <= now() or requested_ends_at <= requested_starts_at then
    raise exception 'Choose a future time range.';
  end if;
  if not exists (select 1 from public.classrooms where id = target_classroom_id and active) then
    raise exception 'This classroom is not available for booking.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_classroom_id::text, 0));
  conflict := public.room_time_conflict(target_classroom_id, requested_starts_at, requested_ends_at);
  if conflict is not null then
    raise exception 'Room is already in use: %', conflict;
  end if;

  insert into public.reservations (classroom_id, title, starts_at, ends_at, status, created_by)
  values (target_classroom_id, btrim(request_title), requested_starts_at, requested_ends_at, 'pending', requester_id)
  returning id into reservation_id;

  return reservation_id;
end;
$$;

revoke all on function public.request_room_reservation(uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.request_room_reservation(uuid, text, timestamptz, timestamptz) to authenticated;

create or replace function public.guard_approved_reservation_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict text;
begin
  if new.status = 'approved' then
    perform pg_advisory_xact_lock(hashtextextended(new.classroom_id::text, 0));
    conflict := public.room_time_conflict(new.classroom_id, new.starts_at, new.ends_at, new.id);
    if conflict is not null then
      raise exception 'Cannot approve reservation because the room is in use: %', conflict
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

create trigger reservations_prevent_approved_conflicts
  before insert or update of classroom_id, starts_at, ends_at, status on public.reservations
  for each row execute procedure public.guard_approved_reservation_conflicts();

create or replace function public.guard_room_block_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_title text;
begin
  if new.ends_at <= new.starts_at then
    raise exception 'Room block end must be after its start.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.classroom_id::text, 0));
  select title into reservation_title
  from public.reservations
  where classroom_id = new.classroom_id
    and status = 'approved'
    and starts_at < new.ends_at
    and ends_at > new.starts_at
  limit 1;

  if reservation_title is not null then
    raise exception 'Room block conflicts with approved reservation: %', reservation_title
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger room_blocks_prevent_approved_conflicts
  before insert or update of classroom_id, starts_at, ends_at on public.room_blocks
  for each row execute procedure public.guard_room_block_conflicts();

create or replace function public.guard_recurring_schedule_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  overlap_start date;
  overlap_end date;
  first_occurrence date;
  new_start_minute integer;
  new_end_minute integer;
  existing_start_minute integer;
  existing_end_minute integer;
  occupied record;
  first_occupied_day date;
  last_occupied_day date;
  day_offset integer;
  occurrence_date date;
  occurrence_starts_at timestamptz;
  occurrence_ends_at timestamptz;
begin
  if not new.enabled then
    return new;
  end if;
  if new.effective_end is not null and new.effective_end < new.effective_start then
    raise exception 'Schedule end date must be on or after its start date.';
  end if;
  if new.end_time::time <= new.start_time::time then
    raise exception 'Recurring schedules must end later on the same day.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.classroom_id::text, 0));
  new_start_minute := extract(hour from new.start_time::time)::integer * 60 + extract(minute from new.start_time::time)::integer;
  new_end_minute := extract(hour from new.end_time::time)::integer * 60 + extract(minute from new.end_time::time)::integer;

  for occupied in
    select schedule.title, schedule.start_time, schedule.end_time,
      schedule.effective_start, schedule.effective_end
    from public.recurring_schedules as schedule
    where schedule.classroom_id = new.classroom_id
      and schedule.enabled
      and schedule.id <> new.id
      and schedule.day_of_week = new.day_of_week
      and greatest(schedule.effective_start, new.effective_start)
        <= least(coalesce(schedule.effective_end, 'infinity'::date), coalesce(new.effective_end, 'infinity'::date))
  loop
    overlap_start := greatest(new.effective_start, occupied.effective_start);
    overlap_end := least(coalesce(new.effective_end, 'infinity'::date), coalesce(occupied.effective_end, 'infinity'::date));
    first_occurrence := overlap_start + ((new.day_of_week - extract(dow from overlap_start)::integer + 7) % 7);
    if first_occurrence > overlap_end then
      continue;
    end if;

    existing_start_minute := extract(hour from occupied.start_time::time)::integer * 60 + extract(minute from occupied.start_time::time)::integer;
    existing_end_minute := extract(hour from occupied.end_time::time)::integer * 60 + extract(minute from occupied.end_time::time)::integer;
    if existing_end_minute <= existing_start_minute then
      existing_end_minute := existing_end_minute + 24 * 60;
    end if;
    if new_start_minute < existing_end_minute and existing_start_minute < new_end_minute then
      raise exception 'Schedule overlaps an existing % schedule on this weekday.', occupied.title;
    end if;
  end loop;

  for occupied in
    select reservation.title, reservation.starts_at, reservation.ends_at
    from public.reservations as reservation
    where reservation.classroom_id = new.classroom_id and reservation.status = 'approved'
    union all
    select block.title, block.starts_at, block.ends_at
    from public.room_blocks as block
    where block.classroom_id = new.classroom_id
  loop
    first_occupied_day := ((occupied.starts_at at time zone 'Asia/Manila')::date - 1);
    last_occupied_day := ((occupied.ends_at - interval '1 microsecond') at time zone 'Asia/Manila')::date;
    if last_occupied_day < first_occupied_day then
      continue;
    end if;

    for day_offset in 0..(last_occupied_day - first_occupied_day) loop
      occurrence_date := first_occupied_day + day_offset;
      if extract(dow from occurrence_date)::integer <> new.day_of_week
        or occurrence_date < new.effective_start
        or (new.effective_end is not null and occurrence_date > new.effective_end) then
        continue;
      end if;

      occurrence_starts_at := (occurrence_date + new.start_time::time) at time zone 'Asia/Manila';
      occurrence_ends_at := (occurrence_date + new.end_time::time) at time zone 'Asia/Manila';
      if occurrence_starts_at < occupied.ends_at and occurrence_ends_at > occupied.starts_at then
        raise exception 'Schedule conflicts with existing room use: %.', occupied.title;
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger recurring_schedules_prevent_conflicts
  before insert or update of classroom_id, day_of_week, start_time, end_time, effective_start, effective_end, enabled
  on public.recurring_schedules
  for each row execute procedure public.guard_recurring_schedule_conflicts();
