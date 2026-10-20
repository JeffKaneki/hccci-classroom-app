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
    lower(new.email),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

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

drop policy if exists "users create own reservation requests" on public.reservations;

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
  conflict_title text;
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

drop trigger if exists recurring_schedules_prevent_conflicts on public.recurring_schedules;
create trigger recurring_schedules_prevent_conflicts
  before insert or update of classroom_id, day_of_week, start_time, end_time, effective_start, effective_end, enabled
  on public.recurring_schedules
  for each row execute procedure public.guard_recurring_schedule_conflicts();

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

drop trigger if exists reservations_prevent_approved_conflicts on public.reservations;
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

drop trigger if exists room_blocks_prevent_approved_conflicts on public.room_blocks;
create trigger room_blocks_prevent_approved_conflicts
  before insert or update of classroom_id, starts_at, ends_at on public.room_blocks
  for each row execute procedure public.guard_room_block_conflicts();
