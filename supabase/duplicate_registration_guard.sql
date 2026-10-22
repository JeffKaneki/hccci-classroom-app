-- Run this migration on an existing project to prevent duplicate registration attempts.

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create or replace function public.is_registration_email_available(target_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select not exists (
    select 1
    from auth.users
    where lower(email) = lower(btrim(target_email))
  );
$$;

revoke all on function public.is_registration_email_available(text) from public;
grant execute on function public.is_registration_email_available(text) to anon, authenticated;
