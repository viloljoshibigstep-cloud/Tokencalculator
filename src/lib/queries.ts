import { type SupabaseClient } from "@supabase/supabase-js";

export type Range = "1D" | "7D" | "30D" | "3M" | "1Y";

export function rangeToFromDate(range: Range): Date {
  const now = new Date();
  const map: Record<Range, number> = {
    "1D": 1,
    "7D": 7,
    "30D": 30,
    "3M": 90,
    "1Y": 365,
  };
  const days = map[range];
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

// Map dashboard range pills to the codeburn `-p` periods we cache snapshots for.
// Names must match codeburn's accepted values exactly: today, week, 30days, month, all.
// codeburn doesn't support an arbitrary 90/365-day window, so 3M/1Y collapse to "all".
export type CodeburnPeriod = "today" | "week" | "30days" | "all";
export function rangeToPeriod(range: Range): CodeburnPeriod {
  switch (range) {
    case "1D":
      return "today";
    case "7D":
      return "week";
    case "30D":
      return "30days";
    case "3M":
    case "1Y":
      return "all";
  }
}

export interface UsageRow {
  user_id: string;
  occurred_at: string;
  provider: string;
  model: string | null;
  project: string | null;
  task_category: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  calls: number;
  cost_usd: number;
}

export interface UsageQuery {
  range: Range;
  userId?: string;
  forAllUsers?: boolean;
}

export async function fetchUsage(
  supabase: SupabaseClient,
  q: UsageQuery,
): Promise<UsageRow[]> {
  const from = rangeToFromDate(q.range).toISOString();
  let query = supabase
    .from("usage_events")
    .select(
      "user_id, occurred_at, provider, model, project, task_category, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, calls, cost_usd",
    )
    .gte("occurred_at", from)
    .order("occurred_at", { ascending: false });

  if (q.userId && !q.forAllUsers) {
    query = query.eq("user_id", q.userId);
  }

  const { data, error } = await query.limit(10000);
  if (error) throw error;
  return (data as unknown as UsageRow[]) ?? [];
}

// =====================
// Snapshot types + helpers
// =====================

export interface SnapshotModel {
  name: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
}

export interface SnapshotProject {
  name: string;
  path: string;
  cost: number;
  calls: number;
  sessions: number;
  avgCostPerSession?: number;
}

export interface SnapshotOverview {
  cost: number;
  calls: number;
  sessions: number;
  cacheHitPercent?: number;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface CodeburnSnapshot {
  generated: string;
  period: string;
  overview: SnapshotOverview | null;
  daily: { date: string; cost: number; calls: number }[];
  projects: SnapshotProject[];
  models: SnapshotModel[];
  topSessions: { project: string; sessionId: string; date: string; cost: number; calls: number }[];
}

export async function fetchLatestSnapshot(
  supabase: SupabaseClient,
  opts?: { provider?: string; period?: string },
): Promise<CodeburnSnapshot | null> {
  let q = supabase
    .from("agent_snapshots")
    .select("snapshot")
    .order("taken_at", { ascending: false })
    .limit(1);

  if (opts?.provider) q = q.eq("provider", opts.provider);
  if (opts?.period) q = q.eq("period", opts.period);

  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return data.snapshot as CodeburnSnapshot;
}

export interface ProviderSnapshotRow {
  provider: string;
  period: string;
  taken_at: string;
  snapshot: CodeburnSnapshot;
}

// Fetch the latest snapshot row for each (provider, period) for the current
// user. Used by the /tools page and provider-aware queries.
export async function fetchAllSnapshots(
  supabase: SupabaseClient,
): Promise<ProviderSnapshotRow[]> {
  const { data, error } = await supabase
    .from("agent_snapshots")
    .select("provider, period, taken_at, snapshot")
    .order("taken_at", { ascending: false });
  if (error || !data) return [];
  // De-dupe to latest per (provider, period)
  const seen = new Set<string>();
  const rows: ProviderSnapshotRow[] = [];
  for (const r of data as unknown as ProviderSnapshotRow[]) {
    const key = `${r.provider}::${r.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return rows;
}

// =====================
// KPI computations
// =====================

export interface KpiSummary {
  totalCost: number;
  totalTokens: number;
  workingTokens: number;
  cacheTokens: number;
  totalCalls: number;
  totalSessions: number;
  avgCostPerSession: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  topModel: string | null;
  topProject: string | null;
}

// When a `snapshot` is passed, token counts and message/session counts come
// directly from `snapshot.overview` (codeburn's exact totals for that period).
// Otherwise we fall back to summing the events table (cost is always exact;
// tokens are proportional and may drift on range-scoped views).
export function computeKpis(rows: UsageRow[], snapshot?: CodeburnSnapshot | null): KpiSummary {
  const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);

  const ov = snapshot?.overview;
  const tokens = ov?.tokens;
  const workingTokens = tokens
    ? Number(tokens.input ?? 0) + Number(tokens.output ?? 0)
    : rows.reduce((s, r) => s + Number(r.input_tokens) + Number(r.output_tokens), 0);
  const cacheTokens = tokens
    ? Number(tokens.cacheRead ?? 0) + Number(tokens.cacheWrite ?? 0)
    : rows.reduce(
        (s, r) => s + Number(r.cache_read_tokens) + Number(r.cache_write_tokens),
        0,
      );
  const totalTokens = workingTokens + cacheTokens;

  const totalCalls = ov?.calls != null
    ? Number(ov.calls)
    : rows.reduce((s, r) => s + Number(r.calls || 0), 0);
  const totalSessions = ov?.sessions != null ? Number(ov.sessions) : rows.length;
  const byProject = new Map<string, number>();
  for (const r of rows) {
    if (r.project) byProject.set(r.project, (byProject.get(r.project) ?? 0) + Number(r.cost_usd));
  }
  const topProject = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const days = activeDays(rows);
  const { current, longest } = computeStreaks(days);

  // Favorite model: from snapshot (codeburn knows the per-model breakdown)
  const topModel = snapshot?.models?.length
    ? [...snapshot.models].sort((a, b) => b.cost - a.cost)[0]?.name ?? null
    : null;

  return {
    totalCost,
    totalTokens,
    workingTokens,
    cacheTokens,
    totalCalls,
    totalSessions,
    avgCostPerSession: totalSessions ? totalCost / totalSessions : 0,
    activeDays: days.size,
    currentStreak: current,
    longestStreak: longest,
    topModel,
    topProject,
  };
}

function activeDays(rows: UsageRow[]): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    if (Number(r.cost_usd) > 0) set.add(new Date(r.occurred_at).toISOString().slice(0, 10));
  }
  return set;
}

function computeStreaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const cur = new Date(sorted[i]);
    const diff = (cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  // Current streak: count back from today
  const today = new Date().toISOString().slice(0, 10);
  let current = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (key === today) {
      // Allow today to be empty; check yesterday
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
    if (current > 365) break;
  }
  return { current, longest };
}

export interface DailyBucket {
  day: string;
  cost: number;
  tokens: number;
}

export function bucketByDay(rows: UsageRow[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const r of rows) {
    const day = new Date(r.occurred_at).toISOString().slice(0, 10);
    const cur = map.get(day) ?? { day, cost: 0, tokens: 0 };
    cur.cost += Number(r.cost_usd);
    cur.tokens += Number(r.total_tokens);
    map.set(day, cur);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export interface BreakdownRow {
  key: string;
  cost: number;
  tokens: number;
  events: number;
}

export function breakdownBy(rows: UsageRow[], field: keyof UsageRow): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const r of rows) {
    const key = (r[field] as string | null) || "—";
    const cur = map.get(key) ?? { key, cost: 0, tokens: 0, events: 0 };
    cur.cost += Number(r.cost_usd);
    cur.tokens += Number(r.total_tokens);
    cur.events += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

// =====================
// Profile questionnaire + efficiency
// =====================

export type Seniority = "junior" | "mid" | "senior" | "staff" | "principal";
export type ExpectedPattern = "light" | "moderate" | "heavy";
export type EfficiencyBand =
  | "inactive"
  | "light"
  | "optimal"
  | "on_budget"
  | "over_consuming";

export interface ProfileQuestionnaire {
  job_role: string | null;
  department: string | null;
  seniority: Seniority | null;
  task_types: string[] | null;
  expected_pattern: ExpectedPattern | null;
  team: string | null;
  industry: string | null;
  profile_completed_at: string | null;
}

export interface EfficiencyRow {
  user_id: string;
  email: string;
  full_name: string | null;
  job_role: string | null;
  department: string | null;
  team: string | null;
  seniority: Seniority | null;
  expected_pattern: ExpectedPattern | null;
  task_types: string[] | null;
  profile_completed_at: string | null;
  benchmark_tokens_per_day: number;
  benchmark_cost_per_day_usd: number;
  actual_working_tokens_30d: number;
  actual_cache_tokens_30d: number;
  actual_cost_30d: number;
  actual_calls_30d: number;
  active_days_30d: number;
  expected_tokens_30d: number;
  expected_cost_30d: number;
  efficiency_ratio: number | null;
  band: EfficiencyBand;
}

export async function fetchMyEfficiency(
  supabase: SupabaseClient,
  userId: string,
): Promise<EfficiencyRow | null> {
  const { data, error } = await supabase
    .from("user_efficiency")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as EfficiencyRow | null;
}

// Admin-only — RLS view filters to (self or is_admin()), so non-admins get [their row].
export async function fetchAllEfficiency(
  supabase: SupabaseClient,
): Promise<EfficiencyRow[]> {
  const { data, error } = await supabase
    .from("user_efficiency")
    .select("*")
    .order("efficiency_ratio", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data as EfficiencyRow[];
}

export async function fetchProfileQuestionnaire(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileQuestionnaire | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "job_role, department, seniority, task_types, expected_pattern, team, industry, profile_completed_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProfileQuestionnaire;
}

export const BAND_LABELS: Record<EfficiencyBand, string> = {
  inactive: "No activity",
  light: "Light usage",
  optimal: "Optimal",
  on_budget: "On budget",
  over_consuming: "Over budget",
};

// Tailwind classes for band pills. Same vocab used on the Overview KPI and
// the /efficiency table so admins read at a glance.
export const BAND_STYLES: Record<EfficiencyBand, string> = {
  inactive:        "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  light:           "bg-sky-500/10 text-sky-300 border-sky-500/25",
  optimal:         "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  on_budget:       "bg-amber-500/10 text-amber-300 border-amber-500/25",
  over_consuming:  "bg-red-500/10 text-red-300 border-red-500/30",
};
