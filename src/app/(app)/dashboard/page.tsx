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
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Topbar, RangeSelector, useRange } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { UsageChart } from "@/components/usage-chart";
import { ActivityHeatmap } from "@/components/heatmap";
import {
  bucketByDay,
  computeKpis,
  fetchUsage,
  fetchLatestSnapshot,
  type CodeburnSnapshot,
  type UsageRow,
} from "@/lib/queries";
import { formatCurrency, formatNumber, timeAgo } from "@/lib/utils";

export default function OverviewPage() {
  const [range, setRange] = useRange("7D");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [allRows, setAllRows] = useState<UsageRow[]>([]);
  const [snapshot, setSnapshot] = useState<CodeburnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    setLoading(true);
    let cancelled = false;
    Promise.all([
      fetchUsage(supabase, { range }),
      fetchUsage(supabase, { range: "1Y" }),
      // Aggregate snapshot across all providers, all-time. Falls back to whatever
      // snapshot exists if the agent hasn't synced "all/all" yet.
      fetchLatestSnapshot(supabase, { provider: "all", period: "all" }).then(
        (s) => s ?? fetchLatestSnapshot(supabase),
      ),
    ])
      .then(([scoped, all, snap]) => {
        if (cancelled) return;
        setRows(scoped);
        setAllRows(all);
        setSnapshot(snap);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const kpis = useMemo(() => computeKpis(rows, snapshot), [rows, snapshot]);
  const allTimeKpis = useMemo(() => computeKpis(allRows, snapshot), [allRows, snapshot]);
  const daily = useMemo(() => bucketByDay(rows), [rows]);
  const heatmap = useMemo(() => bucketByDay(allRows), [allRows]);
  const recentSessions = (snapshot?.topSessions ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  const sessionsCount = snapshot?.overview?.sessions ?? kpis.totalSessions;
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
          value={(snapshot?.overview?.sessions ?? kpis.totalSessions).toLocaleString()}
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
            <h2 className="text-base font-semibold text-white">Daily spend</h2>
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
            <h2 className="text-base font-semibold text-white">Activity (last 90 days)</h2>
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
          <h2 className="text-base font-semibold text-white">Top sessions</h2>
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
                  <div className="col-span-5 truncate text-white">{niceName}</div>
                  <div className="col-span-2 truncate text-[var(--muted-foreground)] text-[11px]">
                    {s.calls.toLocaleString()} msgs
                  </div>
                  <div className="col-span-2 text-right font-medium text-white">
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
          <h3 className="text-base font-semibold text-white">No data yet</h3>
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
