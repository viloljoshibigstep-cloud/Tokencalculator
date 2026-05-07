"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Topbar } from "@/components/topbar";
import { fetchLatestSnapshot, type CodeburnSnapshot } from "@/lib/queries";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function ModelsPage() {
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

  const models = (snapshot?.models ?? []).slice().sort((a, b) => b.cost - a.cost);
  const totalCost = models.reduce((s, m) => s + m.cost, 0);

  return (
    <>
      <Topbar
        title="Models"
        subtitle="Cost, token mix, and efficiency by model (latest snapshot)"
      />

      <div className="glass-card rounded-2xl">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          <div className="col-span-3">Model</div>
          <div className="col-span-1 text-right">Calls</div>
          <div className="col-span-2 text-right">Input</div>
          <div className="col-span-2 text-right">Output</div>
          <div className="col-span-2 text-right">Cache (R/W)</div>
          <div className="col-span-2 text-right">Cost</div>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : models.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            No data yet. Wait for the next agent sync (every 15 min) or run it manually.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {models.map((m) => {
              const pct = totalCost > 0 ? (m.cost / totalCost) * 100 : 0;
              return (
                <div
                  key={m.name}
                  className="relative grid grid-cols-12 items-center gap-3 px-5 py-4 text-sm"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/8 to-transparent"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <div className="relative col-span-3">
                    <div className="font-medium text-[var(--tx-hi)]">{m.name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {pct.toFixed(1)}% of spend
                    </div>
                  </div>
                  <div className="relative col-span-1 text-right text-[var(--muted-foreground)]">
                    {m.calls.toLocaleString()}
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                    {formatNumber(m.inputTokens)}
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                    {formatNumber(m.outputTokens)}
                  </div>
                  <div className="relative col-span-2 text-right text-[var(--muted-foreground)] text-[11px]">
                    {formatNumber(m.cacheReadTokens)} / {formatNumber(m.cacheWriteTokens)}
                  </div>
                  <div className="relative col-span-2 text-right font-semibold text-[var(--tx-hi)]">
                    {formatCurrency(m.cost)}
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
