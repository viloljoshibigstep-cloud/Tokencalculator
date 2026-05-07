"use client";

import { useState } from "react";

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
    <div
      className="inline-flex items-center gap-0.5 rounded-full p-1"
      style={{
        background: "var(--bg-100)",
        border: "1px solid var(--line)",
      }}
    >
      {ranges.map((r) => {
        const on = value === r;
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
            style={
              on
                ? { background: "var(--ink)", color: "var(--tx-on-ink)" }
                : { background: "transparent", color: "var(--tx-md)" }
            }
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

export function Topbar({
  title,
  subtitle,
  eyebrow,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div
            className="text-[12px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--tx-lo)" }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="mt-2 text-[34px] font-bold leading-[1.05] tracking-[-0.025em]"
          style={{ color: "var(--tx-hi)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm" style={{ color: "var(--tx-md)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}

export function useRange(initial: Range = "7D") {
  return useState<Range>(initial);
}
