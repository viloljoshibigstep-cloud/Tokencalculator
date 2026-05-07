import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: { value: string; positive: boolean };
  accent?: "cyan" | "emerald" | "violet";
}

const accents = {
  cyan: "from-cyan-400/20 to-cyan-400/5 text-cyan-300",
  emerald: "from-emerald-400/20 to-emerald-400/5 text-emerald-300",
  violet: "from-violet-400/20 to-violet-400/5 text-violet-300",
};

export function KpiCard({ label, value, icon: Icon, delta, accent = "cyan" }: KpiCardProps) {
  return (
    <div className="glass-card relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-xl bg-gradient-to-br",
            accents[accent],
          )}
        >
          <Icon className="size-5" />
        </div>
        {delta && (
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium",
              delta.positive
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-red-500/10 text-red-300",
            )}
          >
            {delta.positive ? "↑" : "↓"} {delta.value}
          </span>
        )}
      </div>
      <div className="mt-5">
        <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{label}</div>
      </div>
      <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-gradient-to-br from-[var(--accent-to)]/10 to-transparent blur-2xl" />
    </div>
  );
}
