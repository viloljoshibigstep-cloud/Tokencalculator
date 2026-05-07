"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Minus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Topbar } from "@/components/topbar";
import { fetchAllSnapshots, type ProviderSnapshotRow } from "@/lib/queries";
import { SUPPORTED_TOOLS } from "@/lib/tools";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function ToolsPage() {
  const [rows, setRows] = useState<ProviderSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    fetchAllSnapshots(supabase)
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const byProvider = useMemo(() => {
    const map = new Map<string, ProviderSnapshotRow>();
    for (const r of rows) {
      if (r.period !== "all") continue;
      if (r.provider === "all") continue;
      if (!map.has(r.provider)) map.set(r.provider, r);
    }
    return map;
  }, [rows]);

  const totalCost = SUPPORTED_TOOLS.reduce((s, t) => {
    const snap = byProvider.get(t.key);
    return s + Number(snap?.snapshot?.overview?.cost ?? 0);
  }, 0);

  const detectedCount = SUPPORTED_TOOLS.filter((t) => byProvider.has(t.key)).length;

  return (
    <>
      <Topbar
        title="Tools / IDEs"
        subtitle={`${detectedCount} of ${SUPPORTED_TOOLS.length} supported tools detected on your machines`}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryTile label="Detected" value={String(detectedCount)} accent="emerald" />
        <SummaryTile label="Supported" value={String(SUPPORTED_TOOLS.length)} accent="cyan" />
        <SummaryTile label="All-time spend" value={formatCurrency(totalCost)} accent="violet" />
      </div>

      <div className="glass-card rounded-2xl">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          <div className="col-span-1"></div>
          <div className="col-span-3">Tool</div>
          <div className="col-span-2">Vendor</div>
          <div className="col-span-1 text-right">Sessions</div>
          <div className="col-span-2 text-right">Messages</div>
          <div className="col-span-1 text-right">Tokens</div>
          <div className="col-span-2 text-right">Cost</div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {SUPPORTED_TOOLS.slice()
              .sort((a, b) => {
                const aCost = Number(byProvider.get(a.key)?.snapshot?.overview?.cost ?? 0);
                const bCost = Number(byProvider.get(b.key)?.snapshot?.overview?.cost ?? 0);
                return bCost - aCost;
              })
              .map((t) => {
                const snap = byProvider.get(t.key);
                const detected = !!snap;
                const ov = snap?.snapshot?.overview;
                const cost = Number(ov?.cost ?? 0);
                const sessions = Number(ov?.sessions ?? 0);
                const calls = Number(ov?.calls ?? 0);
                const tokens = ov?.tokens
                  ? Number(ov.tokens.input ?? 0) +
                    Number(ov.tokens.output ?? 0) +
                    Number(ov.tokens.cacheRead ?? 0) +
                    Number(ov.tokens.cacheWrite ?? 0)
                  : 0;
                const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;

                return (
                  <div
                    key={t.key}
                    className="relative grid grid-cols-12 items-center gap-3 px-5 py-3.5 text-sm"
                  >
                    {detected && cost > 0 && (
                      <div
                        className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-[rgba(166,242,145,0.18)] to-transparent"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    )}
                    <div className="relative col-span-1">
                      {detected ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--bg-300)] text-[var(--ink)]">
                          <Check className="size-3.5" />
                        </span>
                      ) : (
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                          <Minus className="size-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="relative col-span-3">
                      <div className="font-medium text-[var(--tx-hi)]">{t.label}</div>
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        {detected ? "Active" : "Not detected"}
                      </div>
                    </div>
                    <div className="relative col-span-2 text-[var(--muted-foreground)]">
                      {t.vendor}
                    </div>
                    <div className="relative col-span-1 text-right text-[var(--muted-foreground)]">
                      {detected ? sessions.toLocaleString() : "—"}
                    </div>
                    <div className="relative col-span-2 text-right text-[var(--muted-foreground)]">
                      {detected ? calls.toLocaleString() : "—"}
                    </div>
                    <div className="relative col-span-1 text-right text-[var(--muted-foreground)] text-[11px]">
                      {detected ? formatNumber(tokens) : "—"}
                    </div>
                    <div className="relative col-span-2 text-right font-semibold text-[var(--tx-hi)]">
                      {detected ? formatCurrency(cost) : "—"}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-[var(--muted-foreground)]">
        Detection runs every 15 minutes via the local agent. A tool shows as
        &quot;Active&quot; once codeburn finds session data on disk for it. Tokens are
        summed across input + output + cache. Cost matches codeburn&apos;s pricing
        engine (LiteLLM).
      </p>
    </>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "cyan" | "violet";
}) {
  const dot =
    accent === "emerald"
      ? "var(--mint-400)"
      : accent === "cyan"
        ? "var(--violet-400)"
        : "var(--amber-400)";
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--tx-md)" }}>
        <span
          className="inline-block size-2 rounded-full"
          style={{ background: dot }}
        />
        {label}
      </div>
      <div
        className="mt-3 text-[34px] font-bold leading-none tracking-[-0.03em]"
        style={{ color: "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}
