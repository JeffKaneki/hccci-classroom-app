-- Run this migration after the existing schema and before using course/year features.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  year integer not null check (year between 1 and 6),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, year)
);

alter table public.profiles
  add column if not exists course_id uuid references public.courses (id) on delete set null;

alter table public.recurring_schedules
  add column if not exists course_id uuid references public.courses (id) on delete set null;

create index if not exists profiles_course_id_idx on public.profiles (course_id);
create index if not exists recurring_schedules_course_id_idx on public.recurring_schedules (course_id);

alter table public.courses enable row level security;

drop policy if exists "courses are readable for registration" on public.courses;
create policy "courses are readable for registration" on public.courses
  for select using (active or public.is_admin());

drop policy if exists "admins manage courses" on public.courses;
create policy "admins manage courses" on public.courses
  for all using (public.is_admin())
  with check (public.is_admin());

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

  insert into public.profiles (id, full_name, email, role, course_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'User'),
    lower(new.email),
    'user',
    nullif(new.raw_user_meta_data ->> 'course_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop function if exists public.update_admin_account(uuid, text, public.user_role);

create or replace function public.update_admin_account(
  target_user_id uuid,
  new_full_name text,
  new_role public.user_role,
  new_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if target_user_id = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot remove your own administrator access.';
  end if;
  if nullif(btrim(new_full_name), '') is null then
    raise exception 'Account name is required.';
  end if;
  if new_course_id is not null and not exists (select 1 from public.courses where id = new_course_id and active) then
    raise exception 'Choose an active course and year.';
  end if;

  perform set_config('app.allow_admin_assignment', 'on', true);
  update public.profiles
  set full_name = btrim(new_full_name),
      role = new_role,
      course_id = new_course_id,
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'Account not found.';
  end if;
end;
$$;

revoke all on function public.update_admin_account(uuid, text, public.user_role, uuid) from public, anon;
grant execute on function public.update_admin_account(uuid, text, public.user_role, uuid) to authenticated;
