-- Run this migration in Supabase before using the Accounts dashboard.

alter table public.reservations
  drop constraint if exists reservations_created_by_fkey;

alter table public.reservations
  add constraint reservations_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for update using (public.is_admin())
  with check (public.is_admin());

create or replace function public.update_admin_account(
  target_user_id uuid,
  new_full_name text,
  new_role public.user_role
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

  perform set_config('app.allow_admin_assignment', 'on', true);
  update public.profiles
  set full_name = btrim(new_full_name),
      role = new_role,
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'Account not found.';
  end if;
end;
$$;

revoke all on function public.update_admin_account(uuid, text, public.user_role) from public, anon;
grant execute on function public.update_admin_account(uuid, text, public.user_role) to authenticated;

create or replace function public.delete_admin_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot delete the administrator account currently in use.';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Account not found.';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_admin_account(uuid) from public, anon;
grant execute on function public.delete_admin_account(uuid) to authenticated;
