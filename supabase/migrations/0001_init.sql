-- Token Calculator schema
-- Internal AI coding cost observability for Bigstep
-- Apply via Supabase SQL Editor or supabase db push

-- =====================
-- profiles
-- =====================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- Auto-create profile when a user signs up
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
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================
-- machines (one row per agent install)
-- =====================
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hostname text,
  platform text,
  install_token uuid not null unique default gen_random_uuid(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists machines_user_idx on public.machines (user_id);
create index if not exists machines_token_idx on public.machines (install_token);

-- =====================
-- usage_events (raw events from agents)
-- =====================
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  provider text not null,
  model text not null default '',
  project text,
  session_id text not null default '',
  task_category text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  total_tokens bigint generated always as (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) stored,
  cost_usd numeric(12, 6) not null default 0,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create index if not exists usage_events_user_occurred_idx on public.usage_events (user_id, occurred_at desc);
create index if not exists usage_events_provider_idx on public.usage_events (provider);
create index if not exists usage_events_model_idx on public.usage_events (model);
create index if not exists usage_events_project_idx on public.usage_events (project);
create index if not exists usage_events_occurred_idx on public.usage_events (occurred_at desc);

-- Dedup: same (machine, session, occurred_at, model) is a single event.
-- Plain column-list constraint so ON CONFLICT can target it.
alter table public.usage_events drop constraint if exists usage_events_dedup_uq;
alter table public.usage_events
  add constraint usage_events_dedup_uq
  unique (machine_id, session_id, occurred_at, model);

-- =====================
-- budgets (per-user monthly limit)
-- =====================
create table if not exists public.budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit_usd numeric(10, 2),
  alert_threshold_pct int default 80,
  updated_at timestamptz not null default now()
);

-- =====================
-- RLS helpers
-- =====================
-- SECURITY DEFINER so the function reads profiles without triggering RLS
-- (avoids infinite recursion when profile policies need to check role)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- =====================
-- RLS
-- =====================
alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.usage_events enable row level security;
alter table public.budgets enable row level security;

-- profiles: everyone signed in can read; users update own
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- machines: users see their own; admins see all
drop policy if exists "machines_read_own" on public.machines;
create policy "machines_read_own"
  on public.machines for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "machines_insert_own" on public.machines;
create policy "machines_insert_own"
  on public.machines for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "machines_update_own" on public.machines;
create policy "machines_update_own"
  on public.machines for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "machines_delete_own" on public.machines;
create policy "machines_delete_own"
  on public.machines for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- usage_events: users see their own; admins see all. Inserts only via service role.
drop policy if exists "usage_read_own" on public.usage_events;
create policy "usage_read_own"
  on public.usage_events for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- budgets: users read/write own; admins read/write any
drop policy if exists "budgets_read" on public.budgets;
create policy "budgets_read"
  on public.budgets for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "budgets_write" on public.budgets;
create policy "budgets_write"
  on public.budgets for all
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- =====================
-- helper view: daily rollup (computed on read)
-- =====================
create or replace view public.daily_rollups as
select
  user_id,
  date_trunc('day', occurred_at) as day,
  provider,
  model,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(cache_read_tokens) as cache_read_tokens,
  sum(cache_write_tokens) as cache_write_tokens,
  sum(total_tokens) as total_tokens,
  sum(cost_usd) as cost_usd,
  count(*) as event_count
from public.usage_events
group by user_id, date_trunc('day', occurred_at), provider, model;
