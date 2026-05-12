"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Activity,
  MessageSquare,
  CalendarDays,
  Flame,
  Layers,
  Database,
  FolderKanban,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Topbar, RangeSelector, useRange } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { UsageChart } from "@/components/usage-chart";
import { ActivityHeatmap } from "@/components/heatmap";
import { EfficiencyBadge } from "@/components/efficiency-badge";
import {
  bucketByDay,
  computeKpis,
  fetchUsage,
  fetchLatestSnapshot,
  fetchMyEfficiency,
  rangeToPeriod,
  type CodeburnSnapshot,
  type EfficiencyRow,
  type UsageRow,
} from "@/lib/queries";
import { formatCurrency, formatNumber, timeAgo } from "@/lib/utils";

export default function OverviewPage() {
  const [range, setRange] = useRange("7D");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [allRows, setAllRows] = useState<UsageRow[]>([]);
  const [scopedSnapshot, setScopedSnapshot] = useState<CodeburnSnapshot | null>(null);
  const [allSnapshot, setAllSnapshot] = useState<CodeburnSnapshot | null>(null);
  const [efficiency, setEfficiency] = useState<EfficiencyRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;
    const period = rangeToPeriod(range);
    (async () => {
      const { data: userResp } = await supabase.auth.getUser();
      if (userResp.user) {
        const eff = await fetchMyEfficiency(supabase, userResp.user.id);
        if (!cancelled) setEfficiency(eff);
      }
    })();
    Promise.all([
      fetchUsage(supabase, { range }),
      fetchUsage(supabase, { range: "1Y" }),
      // Range-matched snapshot: tokens, sessions, messages come from this exactly.
      fetchLatestSnapshot(supabase, { provider: "all", period }).then(
        (s) => s ?? fetchLatestSnapshot(supabase, { provider: "all", period: "all" }),
      ),
      // All-time snapshot: stable source for top sessions / heatmap context.
      fetchLatestSnapshot(supabase, { provider: "all", period: "all" }).then(
        (s) => s ?? fetchLatestSnapshot(supabase),
      ),
    ])
      .then(([scoped, all, scopedSnap, allSnap]) => {
        if (cancelled) return;
        setRows(scoped);
        setAllRows(all);
        setScopedSnapshot(scopedSnap);
        setAllSnapshot(allSnap);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Range-scoped KPIs use the matching-period snapshot for exact tokens/sessions.
  const kpis = useMemo(() => computeKpis(rows, scopedSnapshot), [rows, scopedSnapshot]);
  // All-time KPIs (active days, streak) always use the full event set + all-snapshot.
  const allTimeKpis = useMemo(() => computeKpis(allRows, allSnapshot), [allRows, allSnapshot]);
  const daily = useMemo(() => bucketByDay(rows), [rows]);
  const heatmap = useMemo(() => bucketByDay(allRows), [allRows]);
  const recentSessions = (allSnapshot?.topSessions ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const sessionsCount = scopedSnapshot?.overview?.sessions ?? kpis.totalSessions;
  const avgPerSession = sessionsCount > 0 ? kpis.totalCost / sessionsCount : 0;

  const empty = !loading && allRows.length === 0;

  return (
    <>
      <Topbar title="Overview" subtitle="Your AI coding spend at a glance">
        <RangeSelector value={range} onChange={setRange} />
      </Topbar>

      {empty && <EmptyState />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Spend"
          value={formatCurrency(kpis.totalCost)}
          icon={DollarSign}
          accent="cyan"
        />
        <KpiCard
          label="Working Tokens"
          value={formatNumber(kpis.workingTokens)}
          icon={Activity}
          accent="emerald"
        />
        <KpiCard
          label="Messages"
          value={formatNumber(kpis.totalCalls)}
          icon={MessageSquare}
          accent="violet"
        />
        <KpiCard
          label="Avg / Session"
          value={formatCurrency(avgPerSession, 2)}
          icon={FolderKanban}
          accent="cyan"
        />
      </div>

      <EfficiencyPanel efficiency={efficiency} />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active Days"
          value={String(allTimeKpis.activeDays)}
          icon={CalendarDays}
          accent="emerald"
        />
        <KpiCard
          label="Current Streak"
          value={`${allTimeKpis.currentStreak}d`}
          icon={Flame}
          accent="violet"
        />
        <KpiCard
          label="Sessions"
          value={(scopedSnapshot?.overview?.sessions ?? kpis.totalSessions).toLocaleString()}
          icon={Layers}
          accent="cyan"
        />
        <KpiCard
          label="Cache Tokens"
          value={formatNumber(kpis.cacheTokens)}
          icon={Database}
          accent="emerald"
        />
      </div>

      <div className="mt-5 glass-card rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--tx-hi)]">Daily spend</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Cost over selected window
            </p>
          </div>
        </div>
        {loading ? (
          <div className="flex h-80 items-center justify-center text-sm text-[var(--muted-foreground)]">
            Loading…
          </div>
        ) : daily.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-sm text-[var(--muted-foreground)]">
            No usage in this range yet.
          </div>
        ) : (
          <UsageChart data={daily} />
        )}
      </div>

      <div className="mt-5 glass-card rounded-2xl p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--tx-hi)]">Activity (last 90 days)</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {allTimeKpis.activeDays} active days · longest streak {allTimeKpis.longestStreak}d
            </p>
          </div>
        </div>
        <ActivityHeatmap data={heatmap} days={90} />
        <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
          <span>Less</span>
          <span className="size-3 rounded-sm bg-[var(--muted)]/40" />
          <span className="size-3 rounded-sm bg-cyan-500/15" />
          <span className="size-3 rounded-sm bg-cyan-500/35" />
          <span className="size-3 rounded-sm bg-emerald-500/55" />
          <span className="size-3 rounded-sm bg-emerald-400/75" />
          <span className="size-3 rounded-sm bg-emerald-400" />
          <span>More</span>
        </div>
      </div>

      <div className="mt-5 glass-card rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
          <h2 className="text-base font-semibold text-[var(--tx-hi)]">Top sessions</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            From your latest snapshot
          </span>
        </div>
        {recentSessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No sessions yet. Install the agent to start tracking.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {recentSessions.map((s) => {
              const projectName = s.project
                ? s.project.startsWith("-")
                  ? "/" + s.project.slice(1).replace(/-/g, "/")
                  : s.project
                : "—";
              const niceName = projectName.split("/").slice(-2).join("/");
              return (
                <div
                  key={s.sessionId}
                  className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
                >
                  <div className="col-span-3 truncate text-[var(--muted-foreground)]">
                    {timeAgo(s.date)}
                  </div>
                  <div className="col-span-5 truncate text-[var(--tx-hi)]">{niceName}</div>
                  <div className="col-span-2 truncate text-[var(--muted-foreground)] text-[11px]">
                    {s.calls.toLocaleString()} msgs
                  </div>
                  <div className="col-span-2 text-right font-medium text-[var(--tx-hi)]">
                    {formatCurrency(Number(s.cost), 2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mb-6 glass-card-strong rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--tx-hi)]">No data yet</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Install the local agent to start tracking your AI coding spend.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="rounded-lg gradient-bg px-4 py-2 text-sm font-medium text-black"
        >
          Install agent →
        </Link>
      </div>
    </div>
  );
}

function EfficiencyPanel({ efficiency }: { efficiency: EfficiencyRow | null }) {
  if (!efficiency) return null;

  // No profile yet → nudge to onboarding
  if (!efficiency.profile_completed_at) {
    return (
      <div className="mt-4 glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-cyan-400/5 text-cyan-300">
              <Gauge className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Efficiency benchmark not set</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">
                Complete your role profile to see how your token usage compares to expected.
              </div>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="rounded-lg bg-[var(--card-elevated)] border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--muted)]"
          >
            Complete profile →
          </Link>
        </div>
      </div>
    );
  }

  const ratio = efficiency.efficiency_ratio;
  const pct = ratio != null ? Math.round(ratio * 100) : 0;
  const pctWidth = Math.min(150, pct);
  const barColor =
    efficiency.band === "over_consuming"
      ? "from-red-500 to-red-400"
      : efficiency.band === "on_budget"
        ? "from-amber-500 to-amber-400"
        : "from-emerald-500 to-cyan-400";

  return (
    <div className="mt-4 glass-card rounded-2xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-400/5 text-emerald-300">
            <Gauge className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Your token efficiency</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              Rolling 30 days · {efficiency.job_role}{" "}
              {efficiency.seniority && `(${efficiency.seniority})`}
            </div>
          </div>
        </div>
        <EfficiencyBadge band={efficiency.band} ratio={ratio} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Actual"
          value={formatNumber(Number(efficiency.actual_working_tokens_30d))}
          hint={`${efficiency.active_days_30d}d active`}
        />
        <Stat
          label="Expected"
          value={formatNumber(Number(efficiency.expected_tokens_30d))}
          hint={`${formatNumber(Number(efficiency.benchmark_tokens_per_day))} / day`}
        />
        <Stat
          label="Ratio"
          value={ratio != null ? `${pct}%` : "—"}
          hint={ratio == null ? "no activity yet" : ratio < 1 ? "under budget" : "over budget"}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[11px] text-[var(--muted-foreground)]">
          <span>0%</span>
          <span>100% (budget)</span>
          <span>150%+</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className={`h-full bg-gradient-to-r transition-all ${barColor}`}
            style={{ width: `${(pctWidth / 150) * 100}%` }}
          />
          {/* 100% marker */}
          <div
            className="absolute top-0 h-full w-px bg-white/40"
            style={{ left: `${(100 / 150) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-white">{value}</div>
      {hint && <div className="text-[11px] text-[var(--muted-foreground)]">{hint}</div>}
    </div>
  );
}
