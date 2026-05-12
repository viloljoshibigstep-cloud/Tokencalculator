"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Gauge, Users, AlertTriangle, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Topbar } from "@/components/topbar";
import { EfficiencyBadge } from "@/components/efficiency-badge";
import {
  fetchAllEfficiency,
  type EfficiencyRow,
  type EfficiencyBand,
} from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function EfficiencyPage() {
  const [rows, setRows] = useState<EfficiencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<"ratio" | "actual" | "expected" | "user">("ratio");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    fetchAllEfficiency(supabase)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Summary tiles
  const summary = useMemo(() => {
    const considered = rows.filter((r) => r.band !== "inactive");
    const bandCount = (b: EfficiencyBand) => rows.filter((r) => r.band === b).length;
    const overBudget = bandCount("over_consuming");
    const optimal = bandCount("optimal");
    const avgRatio =
      considered.length > 0
        ? considered.reduce((s, r) => s + (r.efficiency_ratio ?? 0), 0) /
          considered.length
        : 0;
    const totalOverConsumption = rows
      .filter((r) => r.band === "over_consuming")
      .reduce(
        (s, r) =>
          s + Math.max(0, Number(r.actual_working_tokens_30d) - Number(r.expected_tokens_30d)),
        0,
      );
    return {
      avgRatio,
      overBudget,
      optimal,
      totalOverConsumption,
      totalUsers: rows.length,
    };
  }, [rows]);

  // Aggregate by role
  const byRole = useMemo(() => {
    const map = new Map<
      string,
      { role: string; users: number; avgRatio: number; ratios: number[] }
    >();
    for (const r of rows) {
      const role = r.job_role || "Unset";
      const cur = map.get(role) ?? { role, users: 0, avgRatio: 0, ratios: [] };
      cur.users += 1;
      if (r.efficiency_ratio != null) cur.ratios.push(r.efficiency_ratio);
      map.set(role, cur);
    }
    return [...map.values()]
      .map((b) => ({
        ...b,
        avgRatio:
          b.ratios.length > 0
            ? b.ratios.reduce((s, x) => s + x, 0) / b.ratios.length
            : 0,
      }))
      .sort((a, b) => b.avgRatio - a.avgRatio);
  }, [rows]);

  const sortedRows = useMemo(() => {
    const out = rows.slice();
    if (sortKey === "ratio") {
      out.sort(
        (a, b) =>
          (b.efficiency_ratio ?? -1) - (a.efficiency_ratio ?? -1),
      );
    } else if (sortKey === "actual") {
      out.sort(
        (a, b) =>
          Number(b.actual_working_tokens_30d) - Number(a.actual_working_tokens_30d),
      );
    } else if (sortKey === "expected") {
      out.sort(
        (a, b) => Number(b.expected_tokens_30d) - Number(a.expected_tokens_30d),
      );
    } else if (sortKey === "user") {
      out.sort((a, b) => (a.email || "").localeCompare(b.email || ""));
    }
    return out;
  }, [rows, sortKey]);

  return (
    <>
      <Topbar
        title="Token Consumption Efficiency"
        subtitle="Rolling 30-day actuals vs role-based expected token budgets"
      />

      {!loading && rows.length === 0 && <EmptyState />}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Gauge}
          label="Average ratio"
          value={summary.avgRatio > 0 ? `${Math.round(summary.avgRatio * 100)}%` : "—"}
          hint="Actual ÷ expected, across active users"
          accent="emerald"
        />
        <SummaryCard
          icon={Users}
          label="Optimal users"
          value={`${summary.optimal} / ${summary.totalUsers}`}
          hint="Using AI well within budget"
          accent="cyan"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Over-budget"
          value={String(summary.overBudget)}
          hint="Using >125% of their token budget"
          accent="amber"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Total over-consumption"
          value={formatNumber(summary.totalOverConsumption)}
          hint="Working tokens above expected"
          accent="violet"
        />
      </div>

      {/* By-role aggregate */}
      <div className="mb-5 card rounded-2xl p-5">
        <h2 className="mb-4 text-base font-semibold text-[var(--tx-hi)]">By job role</h2>
        {byRole.length === 0 ? (
          <div className="text-sm text-[var(--muted-foreground)]">
            No role data yet. Members will appear here once they complete onboarding.
          </div>
        ) : (
          <div className="space-y-3">
            {byRole.map((r) => {
              const pct = Math.min(100, Math.round(r.avgRatio * 100));
              const overColor =
                r.avgRatio > 1.25
                  ? "from-red-500 to-red-400"
                  : r.avgRatio > 1
                    ? "from-amber-500 to-amber-400"
                    : "from-emerald-500 to-cyan-400";
              return (
                <div key={r.role}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-[var(--tx-hi)]">
                      {r.role}{" "}
                      <span className="ml-1 text-[11px] text-[var(--muted-foreground)]">
                        · {r.users} {r.users === 1 ? "user" : "users"}
                      </span>
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {r.ratios.length > 0
                        ? `${Math.round(r.avgRatio * 100)}% of budget`
                        : "no usage"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-300)]">
                    <div
                      className={`h-full bg-gradient-to-r transition-all ${overColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-user table */}
      <div className="card rounded-2xl">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          <SortHeader
            label="User"
            active={sortKey === "user"}
            onClick={() => setSortKey("user")}
            span={3}
          />
          <div className="col-span-2">Role / Team</div>
          <SortHeader
            label="Actual"
            active={sortKey === "actual"}
            onClick={() => setSortKey("actual")}
            span={2}
            align="right"
          />
          <SortHeader
            label="Expected"
            active={sortKey === "expected"}
            onClick={() => setSortKey("expected")}
            span={2}
            align="right"
          />
          <SortHeader
            label="Ratio"
            active={sortKey === "ratio"}
            onClick={() => setSortKey("ratio")}
            span={1}
            align="right"
          />
          <div className="col-span-2 text-right">Band</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No users with completed profiles yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {sortedRows.map((r) => (
              <div
                key={r.user_id}
                className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
              >
                <div className="col-span-3 min-w-0">
                  <div className="truncate font-medium text-[var(--tx-hi)]">
                    {r.full_name || r.email.split("@")[0]}
                  </div>
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                    {r.email}
                  </div>
                </div>
                <div className="col-span-2 min-w-0">
                  <div className="truncate text-[var(--muted-foreground)]">
                    {r.job_role || "—"}
                  </div>
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]/70">
                    {[r.seniority, r.team].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <div className="text-[var(--tx-hi)]">
                    {formatNumber(Number(r.actual_working_tokens_30d))}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {formatCurrency(Number(r.actual_cost_30d))} · {r.active_days_30d}d
                  </div>
                </div>
                <div className="col-span-2 text-right text-[var(--muted-foreground)]">
                  {formatNumber(Number(r.expected_tokens_30d))}
                </div>
                <div className="col-span-1 text-right font-semibold text-[var(--tx-hi)]">
                  {r.efficiency_ratio != null
                    ? `${Math.round(r.efficiency_ratio * 100)}%`
                    : "—"}
                </div>
                <div className="col-span-2 flex justify-end">
                  <EfficiencyBadge band={r.band} ratio={r.efficiency_ratio} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-[var(--muted-foreground)]">
        Efficiency ratio = actual working tokens (input + output) ÷ expected for the user&apos;s
        role × active days. Cache reads excluded — they&apos;re cheap and vary too much to
        benchmark on. Bands: &lt;50% light · 50–100% optimal · 100–125% on budget · &gt;125% over.
      </p>
    </>
  );
}

function SortHeader({
  label,
  active,
  onClick,
  span,
  align = "left",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  span: number;
  align?: "left" | "right";
}) {
  return (
    <button
      onClick={onClick}
      className={`col-span-${span} text-${align} transition-colors hover:text-[var(--tx-hi)] ${
        active ? "text-[var(--accent-to)]" : ""
      }`}
      style={{ gridColumn: `span ${span} / span ${span}` }}
    >
      {label} {active && "↓"}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  accent: "emerald" | "cyan" | "amber" | "violet";
}) {
  const accentClasses = {
    emerald: "from-emerald-100 to-emerald-50 text-emerald-700",
    cyan:    "from-sky-100 to-sky-50 text-sky-700",
    amber:   "from-amber-100 to-amber-50 text-amber-800",
    violet:  "from-violet-100 to-violet-50 text-violet-700",
  } as const;
  return (
    <div className="card relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${accentClasses[accent]}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </div>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-[var(--tx-hi)]">{value}</div>
      <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">{hint}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mb-6 card-strong rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--tx-hi)]">No efficiency data yet</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Complete your role profile and install the agent to see your efficiency
            benchmark.
          </p>
        </div>
        <Link
          href="/onboarding"
          className="rounded-lg gradient-bg px-4 py-2 text-sm font-medium text-black"
        >
          Start onboarding →
        </Link>
      </div>
    </div>
  );
}
