import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: { value: string; positive: boolean };
  /**
   * cyan/emerald/violet kept as alias names for compatibility with existing
   * page code. The new design uses mint/violet/amber/rose tints — we map old
   * accent names to the closest new colour.
   */
  accent?: "cyan" | "emerald" | "violet" | "mint" | "amber" | "rose";
}

const ACCENT_BG: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  cyan: "var(--mint-400)",
  emerald: "var(--mint-400)",
  mint: "var(--mint-400)",
  violet: "var(--violet-400)",
  amber: "var(--amber-400)",
  rose: "var(--rose-400)",
};

export function KpiCard({ label, value, icon: Icon, delta, accent = "mint" }: KpiCardProps) {
  const tint = ACCENT_BG[accent];
  return (
    <div className="card relative flex min-h-[154px] flex-col justify-between overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className="grid size-[42px] place-items-center rounded-xl"
          style={{ background: tint, color: "var(--ink)" }}
        >
          <Icon className="size-5" />
        </div>
        {delta && (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-bold",
            )}
            style={
              delta.positive
                ? { background: "var(--bg-300)", color: "var(--ink)" }
                : { background: "rgba(217, 76, 92, 0.12)", color: "#B5374A" }
            }
          >
            {delta.positive ? "↑" : "↓"} {delta.value}
          </span>
        )}
      </div>
      <div>
        <div
          className="text-[34px] font-bold leading-none tracking-[-0.03em]"
          style={{ color: "var(--ink)" }}
        >
          {value}
        </div>
        <div
          className="mt-2 text-[13px]"
          style={{ color: "var(--tx-md)" }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
