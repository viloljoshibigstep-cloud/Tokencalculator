"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const ranges = ["1D", "7D", "30D", "3M", "1Y"] as const;
export type Range = (typeof ranges)[number];

export function RangeSelector({
  value,
  onChange,
}: {
  value: Range;
  onChange: (v: Range) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-[var(--card)] p-1">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-all",
            value === r
              ? "gradient-bg text-black"
              : "text-[var(--muted-foreground)] hover:text-white",
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}

export function useRange(initial: Range = "7D") {
  return useState<Range>(initial);
}
