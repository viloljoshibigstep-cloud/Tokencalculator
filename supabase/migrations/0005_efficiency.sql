-- Token Consumption Efficiency: per-user role profile + benchmarks +
-- read-only `user_efficiency` view that compares actual tokens consumed
-- against an expected baseline for the user's role/seniority/pattern.
--
-- Token-primary: efficiency_ratio = actual_working_tokens / expected_tokens
-- (working tokens = input + output, excludes cache reads which are mostly
-- free; cache tokens vary too much to benchmark on).
--
-- No admin overrides for now — benchmarks come purely from role_baselines.

-- =====================
-- 1. Profile questionnaire fields
-- =====================
alter table public.profiles
  add column if not exists job_role text,
  add column if not exists department text,
  add column if not exists seniority text
    check (seniority is null or seniority in ('junior','mid','senior','staff','principal')),
  add column if not exists task_types text[],
  add column if not exists expected_pattern text
    check (expected_pattern is null or expected_pattern in ('light','moderate','heavy')),
  add column if not exists team text,
  add column if not exists industry text,
  add column if not exists profile_completed_at timestamptz;

create index if not exists profiles_job_role_idx on public.profiles (job_role);
create index if not exists profiles_team_idx on public.profiles (team);

-- =====================
-- 2. Role baselines (reference data)
-- =====================
create table if not exists public.role_baselines (
  role text not null,
  seniority text not null
    check (seniority in ('junior','mid','senior','staff','principal')),
  pattern text not null
    check (pattern in ('light','moderate','heavy')),
  tokens_per_day bigint not null check (tokens_per_day > 0),
  cost_per_day_usd numeric(10,2) not null check (cost_per_day_usd >= 0),
  primary key (role, seniority, pattern)
);

-- Idempotent seed
delete from public.role_baselines;
insert into public.role_baselines (role, seniority, pattern, tokens_per_day, cost_per_day_usd) values
  -- Backend Engineer
  ('Backend Engineer', 'junior',    'light',    10000000,  4),
  ('Backend Engineer', 'junior',    'moderate', 20000000,  8),
  ('Backend Engineer', 'junior',    'heavy',    35000000, 14),
  ('Backend Engineer', 'mid',       'light',    15000000,  6),
  ('Backend Engineer', 'mid',       'moderate', 35000000, 14),
  ('Backend Engineer', 'mid',       'heavy',    55000000, 22),
  ('Backend Engineer', 'senior',    'light',    25000000, 10),
  ('Backend Engineer', 'senior',    'moderate', 45000000, 18),
  ('Backend Engineer', 'senior',    'heavy',    65000000, 28),
  ('Backend Engineer', 'staff',     'moderate', 60000000, 25),
  ('Backend Engineer', 'staff',     'heavy',    85000000, 38),
  ('Backend Engineer', 'principal', 'heavy',    100000000, 45),
  -- Frontend Engineer
  ('Frontend Engineer', 'junior',   'moderate', 18000000,  7),
  ('Frontend Engineer', 'mid',      'moderate', 30000000, 12),
  ('Frontend Engineer', 'mid',      'heavy',    45000000, 18),
  ('Frontend Engineer', 'senior',   'moderate', 40000000, 16),
  ('Frontend Engineer', 'senior',   'heavy',    55000000, 24),
  ('Frontend Engineer', 'staff',    'heavy',    70000000, 30),
  -- Full-Stack Engineer
  ('Full-Stack Engineer', 'mid',    'moderate', 35000000, 14),
  ('Full-Stack Engineer', 'senior', 'heavy',    60000000, 25),
  ('Full-Stack Engineer', 'staff',  'heavy',    85000000, 38),
  -- Mobile Engineer
  ('Mobile Engineer', 'mid',        'moderate', 28000000, 11),
  ('Mobile Engineer', 'senior',     'heavy',    50000000, 22),
  -- Data / ML
  ('Data Scientist', 'junior',      'moderate', 30000000, 12),
  ('Data Scientist', 'mid',         'heavy',    70000000, 30),
  ('Data Scientist', 'senior',      'heavy',    90000000, 40),
  ('ML Engineer', 'mid',            'heavy',    70000000, 30),
  ('ML Engineer', 'senior',         'heavy',    95000000, 42),
  -- Platform / Infra
  ('DevOps', 'mid',                 'moderate', 30000000, 12),
  ('DevOps', 'senior',              'moderate', 45000000, 18),
  ('Platform Engineer', 'senior',   'heavy',    60000000, 25),
  -- QA
  ('QA Engineer', 'mid',            'moderate', 22000000,  9),
  ('QA Engineer', 'senior',         'heavy',    38000000, 16),
  -- Non-engineering
  ('Product Manager', 'mid',        'light',     5000000,  2),
  ('Product Manager', 'mid',        'moderate',  9000000,  4),
  ('Product Manager', 'senior',     'moderate', 15000000,  7),
  ('Product Manager', 'staff',      'heavy',    25000000, 12),
  ('Designer', 'mid',               'light',     4000000,  2),
  ('Designer', 'senior',            'moderate',  9000000,  4),
  ('Technical Writer', 'mid',       'moderate', 12000000,  5),
  ('Marketing', 'mid',              'light',     6000000,  3),
  ('Sales', 'mid',                  'light',     4000000,  2),
  ('Support', 'mid',                'light',     5000000,  2),
  -- Generic fallback (used when role + seniority + pattern combo isn't seeded)
  ('Generic', 'junior',    'light',     6000000,  2),
  ('Generic', 'junior',    'moderate', 14000000,  6),
  ('Generic', 'junior',    'heavy',    28000000, 12),
  ('Generic', 'mid',       'light',    10000000,  4),
  ('Generic', 'mid',       'moderate', 28000000, 11),
  ('Generic', 'mid',       'heavy',    52000000, 22),
  ('Generic', 'senior',    'light',    18000000,  7),
  ('Generic', 'senior',    'moderate', 38000000, 16),
  ('Generic', 'senior',    'heavy',    65000000, 28),
  ('Generic', 'staff',     'moderate', 50000000, 22),
  ('Generic', 'staff',     'heavy',    85000000, 38),
  ('Generic', 'principal', 'heavy',   100000000, 45);

-- Everyone signed in can read baselines (used by the UI on the questionnaire
-- preview, and indirectly by the function below).
alter table public.role_baselines enable row level security;
drop policy if exists "baselines_read_all" on public.role_baselines;
create policy "baselines_read_all" on public.role_baselines for select to authenticated using (true);

-- =====================
-- 3. compute_benchmark()
--    Returns (tokens_per_day, cost_per_day_usd) for the inputs.
--    Falls back: role -> Generic, seniority/pattern -> mid/moderate.
--    Multiplier: 1 + 0.10 × number-of-task-types (capped at 1.5x).
-- =====================
create or replace function public.compute_benchmark(
  p_role text,
  p_seniority text,
  p_pattern text,
  p_task_types text[]
)
returns table (tokens_per_day bigint, cost_per_day_usd numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base_tokens bigint;
  base_cost   numeric;
  mul         numeric;
  v_role      text := coalesce(nullif(trim(p_role), ''), 'Generic');
  v_sen       text := coalesce(nullif(trim(p_seniority), ''), 'mid');
  v_pat       text := coalesce(nullif(trim(p_pattern), ''), 'moderate');
begin
  -- Exact match first
  select b.tokens_per_day, b.cost_per_day_usd
    into base_tokens, base_cost
  from public.role_baselines b
  where b.role = v_role and b.seniority = v_sen and b.pattern = v_pat
  limit 1;

  -- Same role, drift pattern -> moderate
  if base_tokens is null then
    select b.tokens_per_day, b.cost_per_day_usd
      into base_tokens, base_cost
    from public.role_baselines b
    where b.role = v_role and b.seniority = v_sen and b.pattern = 'moderate'
    limit 1;
  end if;

  -- Same role, drift seniority -> mid
  if base_tokens is null then
    select b.tokens_per_day, b.cost_per_day_usd
      into base_tokens, base_cost
    from public.role_baselines b
    where b.role = v_role and b.seniority = 'mid' and b.pattern = v_pat
    limit 1;
  end if;

  -- Fall back to Generic with same seniority + pattern
  if base_tokens is null then
    select b.tokens_per_day, b.cost_per_day_usd
      into base_tokens, base_cost
    from public.role_baselines b
    where b.role = 'Generic' and b.seniority = v_sen and b.pattern = v_pat
    limit 1;
  end if;

  -- Last resort
  if base_tokens is null then
    base_tokens := 25000000;
    base_cost   := 10;
  end if;

  -- Task-type breadth multiplier (1.0x .. 1.5x)
  mul := 1.0 + 0.10 * least(coalesce(array_length(p_task_types, 1), 0), 5);

  tokens_per_day   := (base_tokens * mul)::bigint;
  cost_per_day_usd := round(base_cost * mul, 2);
  return next;
end;
$$;

grant execute on function public.compute_benchmark(text, text, text, text[]) to authenticated;

-- =====================
-- 4. user_efficiency view (rolling 30d, tokens-primary)
--    security_invoker = true → respects RLS on underlying tables.
--    A WHERE clause limits rows to "self or admin" so non-admins can't see
--    other users' rows even if RLS on profiles allows reading them.
-- =====================
create or replace view public.user_efficiency
with (security_invoker = true) as
with usage_30d as (
  select
    e.user_id,
    sum(e.input_tokens + e.output_tokens)::bigint as actual_working_tokens,
    sum(e.cache_read_tokens + e.cache_write_tokens)::bigint as actual_cache_tokens,
    sum(e.cost_usd)::numeric as actual_cost,
    sum(e.calls)::bigint as actual_calls,
    count(distinct date_trunc('day', e.occurred_at))::int as active_days
  from public.usage_events e
  where e.occurred_at >= now() - interval '30 days'
  group by e.user_id
),
benchmarks as (
  select
    p.id as user_id,
    p.email,
    p.full_name,
    p.job_role,
    p.department,
    p.team,
    p.seniority,
    p.expected_pattern,
    p.task_types,
    p.profile_completed_at,
    p.disabled_at,
    cb.tokens_per_day   as benchmark_tokens_per_day,
    cb.cost_per_day_usd as benchmark_cost_per_day_usd
  from public.profiles p,
       lateral public.compute_benchmark(
         p.job_role, p.seniority, p.expected_pattern, p.task_types
       ) cb
)
select
  b.user_id,
  b.email,
  b.full_name,
  b.job_role,
  b.department,
  b.team,
  b.seniority,
  b.expected_pattern,
  b.task_types,
  b.profile_completed_at,
  b.disabled_at,
  b.benchmark_tokens_per_day,
  b.benchmark_cost_per_day_usd,
  coalesce(u.actual_working_tokens, 0) as actual_working_tokens_30d,
  coalesce(u.actual_cache_tokens,   0) as actual_cache_tokens_30d,
  coalesce(u.actual_cost,           0) as actual_cost_30d,
  coalesce(u.actual_calls,          0) as actual_calls_30d,
  coalesce(u.active_days,           0) as active_days_30d,
  -- Expected: benchmark/day × active days (so users with 5 active days are
  -- compared against 5 days of budget, not 30). Floor of 1 to avoid div/0.
  (b.benchmark_tokens_per_day * greatest(coalesce(u.active_days, 0), 1))::bigint
    as expected_tokens_30d,
  (b.benchmark_cost_per_day_usd * greatest(coalesce(u.active_days, 0), 1))::numeric
    as expected_cost_30d,
  -- Ratio: actual / expected. <1 = under budget, >1 = over.
  case
    when coalesce(u.active_days, 0) = 0 then null
    when b.benchmark_tokens_per_day = 0 then null
    else round(
      coalesce(u.actual_working_tokens, 0)::numeric
        / (b.benchmark_tokens_per_day::numeric
           * greatest(coalesce(u.active_days, 0), 1)),
      3
    )
  end as efficiency_ratio,
  case
    when coalesce(u.active_days, 0) = 0 then 'inactive'
    when coalesce(u.actual_working_tokens, 0)::numeric
         / (b.benchmark_tokens_per_day::numeric
            * greatest(coalesce(u.active_days, 0), 1)) < 0.5 then 'light'
    when coalesce(u.actual_working_tokens, 0)::numeric
         / (b.benchmark_tokens_per_day::numeric
            * greatest(coalesce(u.active_days, 0), 1)) <= 1.0 then 'optimal'
    when coalesce(u.actual_working_tokens, 0)::numeric
         / (b.benchmark_tokens_per_day::numeric
            * greatest(coalesce(u.active_days, 0), 1)) <= 1.25 then 'on_budget'
    else 'over_consuming'
  end as band
from benchmarks b
left join usage_30d u on u.user_id = b.user_id
where b.disabled_at is null
  and (b.user_id = auth.uid() or public.is_admin());

grant select on public.user_efficiency to authenticated;
