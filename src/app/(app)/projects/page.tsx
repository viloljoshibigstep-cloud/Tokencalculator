"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Topbar } from "@/components/topbar";
import { fetchLatestSnapshot, type CodeburnSnapshot } from "@/lib/queries";
import { formatCurrency } from "@/lib/utils";

export default function ProjectsPage() {
  const [snapshot, setSnapshot] = useState<CodeburnSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    fetchLatestSnapshot(supabase, { provider: "all", period: "all" })
      .then((s) => s ?? fetchLatestSnapshot(supabase))
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = (snapshot?.projects ?? []).slice().sort((a, b) => b.cost - a.cost);
  const totalCost = projects.reduce((s, p) => s + p.cost, 0);

  return (
    <>
      <Topbar
        title="Projects"
        subtitle="Cost by repository / working directory (latest snapshot)"
      />

      <div className="glass-card rounded-2xl">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          <div className="col-span-5">Project</div>
          <div className="col-span-2 text-right">Sessions</div>
          <div className="col-span-2 text-right">Calls</div>
          <div className="col-span-2 text-right">Avg/Session</div>
          <div className="col-span-1 text-right">Cost</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No data yet. Wait for the next agent sync.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {projects.map((p) => {
              const pct = totalCost > 0 ? (p.cost / totalCost) * 100 : 0;
              const niceName = p.path
                ? p.path.split("/").slice(-2).join("/")
                : p.name;
              return (
                <div
                  key={p.path || p.name}
                  className="relative grid grid-cols-12 items-center gap-3 px-5 py-4 text-sm"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-[rgba(166,242,145,0.18)] to-transparent"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <div className="relative col-span-5 min-w-0">
                    <div className="truncate font-medium text-[var(--tx-hi)]">{niceName}</div>
                    <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                      {p.path}
                    </div>
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                    {p.sessions.toLocaleString()}
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                    {p.calls.toLocaleString()}
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)] text-[11px]">
                    {formatCurrency(p.avgCostPerSession ?? p.cost / Math.max(1, p.sessions))}
                  </div>
                  <div className="relative col-span-1 text-right font-semibold text-[var(--tx-hi)]">
                    {formatCurrency(p.cost)}
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
