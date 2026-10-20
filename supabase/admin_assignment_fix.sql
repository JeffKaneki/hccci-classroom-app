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

drop trigger if exists profiles_prevent_admin_self_assignment on public.profiles;
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
