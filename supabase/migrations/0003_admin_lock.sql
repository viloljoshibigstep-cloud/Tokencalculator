-- Hardcode the admin to a single email. Any other user who somehow gets
-- role='admin' (manual SQL, leaked service key, future bug) is rejected by
-- the BEFORE-INSERT/UPDATE trigger.

-- Source of truth for who is allowed to be admin. Change here if it ever moves.
create or replace function public.is_admin_email(addr text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(addr, '')) = 'vilol.joshi@bigsteptech.com';
$$;

-- Reset any existing rows so the DB matches the rule right now.
update public.profiles
   set role = case when public.is_admin_email(email) then 'admin' else 'member' end
 where role = 'admin' and not public.is_admin_email(email)
    or role <> 'admin' and public.is_admin_email(email);

-- Replace the new-user trigger so role is decided by email, not by row order.
-- Old logic ("first signup becomes admin") is removed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when public.is_admin_email(new.email) then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Enforce on every write to profiles: role='admin' is only legal for the
-- single allowed email. Applies to inserts and updates, including writes
-- coming from the service-role key.
create or replace function public.enforce_admin_email()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' and not public.is_admin_email(new.email) then
    raise exception
      'Only the designated admin email can have role=admin (got %).', new.email
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_email_guard on public.profiles;
create trigger profiles_admin_email_guard
  before insert or update of role, email on public.profiles
  for each row execute function public.enforce_admin_email();
