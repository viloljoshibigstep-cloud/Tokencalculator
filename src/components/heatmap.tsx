"use client";

import { cn, formatCurrency } from "@/lib/utils";

interface DayCell {
  day: string;
  cost: number;
}

export function ActivityHeatmap({ data, days = 90 }: { data: DayCell[]; days?: number }) {
  const map = new Map(data.map((d) => [d.day, d.cost]));
  const cells: { day: string; cost: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ day: key, cost: map.get(key) ?? 0 });
  }

  const max = Math.max(1, ...cells.map((c) => c.cost));

  function intensity(c: number): string {
    if (c <= 0) return "bg-[var(--muted)]/40";
    const ratio = c / max;
    if (ratio < 0.15) return "bg-cyan-500/15";
    if (ratio < 0.35) return "bg-cyan-500/35";
    if (ratio < 0.6) return "bg-emerald-500/55";
    if (ratio < 0.85) return "bg-emerald-400/75";
    return "bg-emerald-400";
  }

  // Group into weeks (columns), starting with the day-of-week of the first cell
  const firstDow = new Date(cells[0].day).getUTCDay();
  const padded: ({ day: string; cost: number } | null)[] = [
    ...Array(firstDow).fill(null),
    ...cells,
  ];
  const weeks: ({ day: string; cost: number } | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((cell, di) => (
            <div
              key={di}
              title={
                cell
                  ? `${cell.day} · ${formatCurrency(cell.cost)}`
                  : ""
              }
              className={cn(
                "size-3 rounded-sm transition-all",
                cell ? intensity(cell.cost) : "bg-transparent",
                cell && cell.cost > 0 && "hover:scale-125",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
