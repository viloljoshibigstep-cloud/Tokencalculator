-- Multi-provider, multi-period snapshots
-- Adds provider + period columns to agent_snapshots, dedupes any rows that
-- existed before these columns were tracked, and locks in a unique index
-- so the agent's upsert(onConflict: machine_id,provider,period) is reliable.
--
-- Idempotent: safe to re-run.

-- 1. Make sure the target columns exist before anything else references them.
alter table public.agent_snapshots
  add column if not exists provider text not null default 'all';

alter table public.agent_snapshots
  add column if not exists period text not null default 'all';

-- 2. Keep only the latest snapshot per (machine_id, provider, period).
--    Without this, the next step's unique index would fail on duplicates
--    that pre-date the new columns (everything used to default to 'all').
--    `taken_at < taken_at OR (taken_at = ... AND ctid < ctid)` covers
--    the case where two rows share a millisecond — neither would lose
--    under a strict `<` and the unique constraint would then fail.
delete from public.agent_snapshots a
using public.agent_snapshots b
where a.machine_id = b.machine_id
  and a.provider   = b.provider
  and a.period     = b.period
  and (a.taken_at < b.taken_at
       or (a.taken_at = b.taken_at and a.ctid < b.ctid));

-- 3. One row per (machine, provider, period). Drop the old name first in
--    case a partial migration left it around.
alter table public.agent_snapshots
  drop constraint if exists agent_snapshots_unique;

alter table public.agent_snapshots
  add constraint agent_snapshots_unique
  unique (machine_id, provider, period);

-- 4. Help the /tools page query: "snapshots for provider = X across machines".
create index if not exists agent_snapshots_provider_idx
  on public.agent_snapshots (provider);
