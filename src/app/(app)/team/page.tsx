import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function TeamPage() {
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
  const { data: profiles = [] } = await admin
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at");

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: events = [] } = await admin
    .from("usage_events")
    .select("user_id, cost_usd, total_tokens")
    .gte("occurred_at", since.toISOString());

  const byUser = new Map<string, { cost: number; tokens: number; events: number }>();
  for (const e of events ?? []) {
    const cur = byUser.get(e.user_id) ?? { cost: 0, tokens: 0, events: 0 };
    cur.cost += Number(e.cost_usd);
    cur.tokens += Number(e.total_tokens);
    cur.events += 1;
    byUser.set(e.user_id, cur);
  }

  const teamRows = (profiles ?? []).map((p) => ({
    ...p,
    stats: byUser.get(p.id) ?? { cost: 0, tokens: 0, events: 0 },
  })).sort((a, b) => b.stats.cost - a.stats.cost);

  return (
    <>
      <Topbar
        title="Team"
        subtitle="30-day spend across everyone in the workspace. Click a row to drill into one person."
      />
      <div className="glass-card rounded-2xl">
        <div className="grid grid-cols-12 gap-3 border-b border-[var(--border)] px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Events</div>
          <div className="col-span-2 text-right">Tokens</div>
          <div className="col-span-2 text-right">Spend</div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {teamRows.map((p) => (
            <Link
              key={p.id}
              href={`/team/${p.id}`}
              className="group grid grid-cols-12 items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-[var(--card-elevated)]/40"
            >
              <div className="col-span-4 flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full gradient-bg text-xs font-semibold text-black">
                  {(p.full_name || p.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">{p.full_name || p.email.split("@")[0]}</div>
                  <div className="truncate text-[11px] text-[var(--muted-foreground)]">{p.email}</div>
                </div>
              </div>
              <div className="col-span-2">
                <span
                  className={
                    p.role === "admin"
                      ? "rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                      : "rounded-md bg-[var(--card-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]"
                  }
                >
                  {p.role}
                </span>
              </div>
              <div className="col-span-2 text-right text-[var(--muted-foreground)]">
                {p.stats.events.toLocaleString()}
              </div>
              <div className="col-span-2 text-right text-[var(--muted-foreground)]">
                {formatNumber(p.stats.tokens)}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2 text-right font-semibold text-white">
                {formatCurrency(p.stats.cost)}
                <ChevronRight className="size-4 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          ))}
          {teamRows.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--muted-foreground)]">
              No team members yet.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
