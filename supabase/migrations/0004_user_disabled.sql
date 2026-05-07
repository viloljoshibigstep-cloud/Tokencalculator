-- Allow the admin to revoke a user's access without deleting them. A non-null
-- disabled_at means the user is locked out: the middleware signs them out on
-- the next request and the agent's install_token stops being honored.

alter table public.profiles
  add column if not exists disabled_at timestamptz;

alter table public.profiles
  add column if not exists disabled_reason text;

create index if not exists profiles_disabled_idx
  on public.profiles (disabled_at)
  where disabled_at is not null;

-- Make sure the admin email can never be disabled via the UI / API. A separate
-- guard from the email lock so a stray admin update can't kill the workspace.
create or replace function public.enforce_admin_not_disabled()
returns trigger
language plpgsql
as $$
begin
  if new.disabled_at is not null and public.is_admin_email(new.email) then
    raise exception
      'The designated admin (%) cannot be disabled.', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_admin_not_disabled on public.profiles;
create trigger profiles_admin_not_disabled
  before insert or update of disabled_at, email on public.profiles
  for each row execute function public.enforce_admin_not_disabled();
