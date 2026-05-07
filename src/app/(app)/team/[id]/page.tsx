import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  DollarSign,
  Layers,
  Wrench,
} from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { KpiCard } from "@/components/kpi-card";
import { UsageChart } from "@/components/usage-chart";
import { bucketByDay, type UsageRow } from "@/lib/queries";
import { toolLabel } from "@/lib/tools";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { AdminControls } from "./admin-controls";

const ADMIN_EMAIL = "vilol.joshi@bigsteptech.com";

interface SnapshotOverview {
  cost?: number;
  sessions?: number;
  calls?: number;
}

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") redirect("/dashboard");

  const admin = createServiceClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, role, created_at, disabled_at, disabled_reason")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const isAdminEmail = profile.email.toLowerCase() === ADMIN_EMAIL;
  const isSelf = profile.id === user.id;
  const isDisabled = !!profile.disabled_at;

  // All-time events for this user. Bigstep is small enough that pulling all
  // rows for one person is cheaper than a stats roll-up; revisit if any single
  // user crosses ~50k events.
  const { data: eventsRaw = [] } = await admin
    .from("usage_events")
    .select(
      "user_id, occurred_at, provider, model, project, task_category, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, calls, cost_usd, session_id",
    )
    .eq("user_id", id)
    .order("occurred_at", { ascending: false });
  const events = (eventsRaw ?? []) as (UsageRow & { session_id: string | null })[];

  const { data: snapshotsRaw = [] } = await admin
    .from("agent_snapshots")
    .select("provider, period, snapshot, taken_at")
    .eq("user_id", id);
  const snapshots = (snapshotsRaw ?? []) as {
    provider: string;
    period: string;
    snapshot: { overview?: SnapshotOverview };
    taken_at: string;
  }[];

  const { data: machinesRaw = [] } = await admin
    .from("machines")
    .select("hostname, platform, last_seen_at")
    .eq("user_id", id)
    .order("last_seen_at", { ascending: false });
  const machines = machinesRaw ?? [];

  // -------- aggregates --------
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const events30 = events.filter((e) => new Date(e.occurred_at) >= since30);

  const sumCost = (rows: UsageRow[]) => rows.reduce((s, e) => s + Number(e.cost_usd), 0);
  const sumTokens = (rows: UsageRow[]) =>
    rows.reduce((s, e) => s + Number(e.total_tokens), 0);

  const cost30 = sumCost(events30);
  const costAll = sumCost(events);
  const tokens30 = sumTokens(events30);
  const sessionsAll = new Set(events.map((e) => e.session_id).filter(Boolean)).size;

  // Daily chart, last 30 days, padded so empty days still render at 0.
  const daily = bucketByDay(events30);

  // Top projects / models, all-time, by cost.
  const aggBy = (key: keyof Pick<UsageRow, "project" | "model">) => {
    const map = new Map<string, { cost: number; tokens: number; events: number }>();
    for (const e of events) {
      const k = (e[key] || "").trim();
      if (!k) continue;
      const cur = map.get(k) ?? { cost: 0, tokens: 0, events: 0 };
      cur.cost += Number(e.cost_usd);
      cur.tokens += Number(e.total_tokens);
      cur.events += 1;
      map.set(k, cur);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.cost - a.cost);
  };
  const topProjects = aggBy("project").slice(0, 8);
  const topModels = aggBy("model").slice(0, 8);

  // Per-tool breakdown from agent_snapshots: provider != "all", period = "all".
  // Fall back to event aggregation if this user has no snapshot rows yet (e.g.
  // the agent ran on the legacy single-blob version that only wrote provider="all").
  const perToolFromSnapshots = snapshots
    .filter((s) => s.provider !== "all" && s.period === "all")
    .map((s) => {
      const ov = s.snapshot?.overview ?? {};
      return {
        provider: s.provider,
        cost: Number(ov.cost ?? 0),
        sessions: Number(ov.sessions ?? 0),
        calls: Number(ov.calls ?? 0),
      };
    });

  const perToolFromEvents = (() => {
    const map = new Map<string, { cost: number; sessions: Set<string>; calls: number }>();
    for (const e of events) {
      const cur = map.get(e.provider) ?? { cost: 0, sessions: new Set<string>(), calls: 0 };
      cur.cost += Number(e.cost_usd);
      cur.calls += Number(e.calls ?? 0);
      if (e.session_id) cur.sessions.add(e.session_id);
      map.set(e.provider, cur);
    }
    return [...map.entries()].map(([provider, v]) => ({
      provider,
      cost: v.cost,
      sessions: v.sessions.size,
      calls: v.calls,
    }));
  })();

  const perTool = (perToolFromSnapshots.length > 0 ? perToolFromSnapshots : perToolFromEvents)
    .sort((a, b) => b.cost - a.cost);

  // Recent activity: most recent 10 events with a session id.
  const recent = events.slice(0, 10);

  const displayName = profile.full_name || profile.email.split("@")[0];
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <Link
        href="/team"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--tx-hi)]"
      >
        <ArrowLeft className="size-3.5" />
        Back to Team
      </Link>

      <Topbar
        title={displayName}
        subtitle={`${profile.email} · ${profile.role} · joined ${joined}`}
      >
        {isDisabled && (
          <span
            className="rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "var(--rose-400)", color: "var(--ink)" }}
          >
            Disabled
          </span>
        )}
      </Topbar>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="30-day spend"
          value={formatCurrency(cost30)}
          icon={DollarSign}
          accent="violet"
        />
        <KpiCard
          label="All-time spend"
          value={formatCurrency(costAll)}
          icon={DollarSign}
          accent="emerald"
        />
        <KpiCard
          label="30-day tokens"
          value={formatNumber(tokens30)}
          icon={Coins}
          accent="cyan"
        />
        <KpiCard
          label="Sessions (all-time)"
          value={sessionsAll.toLocaleString()}
          icon={Layers}
          accent="cyan"
        />
      </div>

      <div className="glass-card mb-6 rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--tx-hi)]">Daily spend (last 30 days)</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            {events30.length} events
          </span>
        </div>
        {daily.length > 0 ? (
          <UsageChart data={daily} />
        ) : (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            No activity in the last 30 days.
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <BreakdownCard title="Top projects" rows={topProjects} emptyLabel="No project tags yet" />
        <BreakdownCard title="Top models" rows={topModels} emptyLabel="No model data yet" />
      </div>

      <div className="glass-card mb-6 rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--tx-hi)]">
            <Wrench className="size-4 text-[var(--tx-hi)]" />
            Tools / IDEs used by {displayName}
          </h2>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
            Sourced from this user&apos;s most recent agent snapshot per provider.
          </p>
        </div>
        {perTool.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No tool usage detected for this user yet.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
              <div className="col-span-4">Tool</div>
              <div className="col-span-3">Vendor</div>
              <div className="col-span-2 text-right">Sessions</div>
              <div className="col-span-3 text-right">Spend</div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {perTool.map((t) => {
                const meta = toolLabel(t.provider);
                return (
                  <div
                    key={t.provider}
                    className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
                  >
                    <div className="col-span-4 truncate font-medium text-[var(--tx-hi)]">{meta.label}</div>
                    <div className="col-span-3 truncate text-[var(--muted-foreground)]">
                      {meta.vendor}
                    </div>
                    <div className="col-span-2 text-right text-[var(--muted-foreground)]">
                      {t.sessions ? t.sessions.toLocaleString() : "—"}
                    </div>
                    <div className="col-span-3 text-right font-semibold text-[var(--tx-hi)]">
                      {formatCurrency(t.cost)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {machines.length > 0 && (
        <div className="glass-card mb-6 rounded-2xl">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h2 className="text-sm font-medium text-[var(--tx-hi)]">Machines</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {machines.map((m, i) => (
              <div
                key={`${m.hostname}-${i}`}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-[var(--tx-hi)]">{m.hostname}</div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {m.platform || "unknown platform"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--muted-foreground)]">
                  Last seen{" "}
                  {m.last_seen_at
                    ? new Date(m.last_seen_at).toLocaleString()
                    : "never"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <AdminControls
          userId={profile.id}
          userEmail={profile.email}
          isDisabled={isDisabled}
          isAdminEmail={isAdminEmail}
          isSelf={isSelf}
        />
      </div>

      <div className="glass-card rounded-2xl">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-medium text-[var(--tx-hi)]">Recent activity</h2>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No activity recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {recent.map((e, i) => (
              <div
                key={`${e.occurred_at}-${i}`}
                className="grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
              >
                <div className="col-span-3 text-[var(--muted-foreground)]">
                  {new Date(e.occurred_at).toLocaleString()}
                </div>
                <div className="col-span-3 truncate text-[var(--tx-hi)]">
                  {toolLabel(e.provider).label}
                </div>
                <div className="col-span-3 truncate text-[var(--muted-foreground)]">
                  {e.project || e.model || "—"}
                </div>
                <div className="col-span-1 text-right text-[var(--muted-foreground)]">
                  {formatNumber(e.total_tokens)}
                </div>
                <div className="col-span-2 text-right font-semibold text-[var(--tx-hi)]">
                  {formatCurrency(Number(e.cost_usd))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function BreakdownCard({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: { key: string; cost: number; tokens: number; events: number }[];
  emptyLabel: string;
}) {
  const total = rows.reduce((s, r) => s + r.cost, 0);
  return (
    <div className="glass-card rounded-2xl">
      <div className="border-b border-[var(--border)] px-5 py-3">
        <h2 className="text-sm font-medium text-[var(--tx-hi)]">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">{emptyLabel}</div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {rows.map((r) => {
            const pct = total > 0 ? (r.cost / total) * 100 : 0;
            return (
              <div
                key={r.key}
                className="relative grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm"
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-[rgba(166,242,145,0.18)] to-transparent"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
                <div className="relative col-span-7 truncate font-medium text-[var(--tx-hi)]">{r.key}</div>
                <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                  {formatNumber(r.tokens)}
                </div>
                <div className="relative col-span-3 text-right font-semibold text-[var(--tx-hi)]">
                  {formatCurrency(r.cost)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
