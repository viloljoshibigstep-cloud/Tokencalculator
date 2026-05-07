"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type DailyBucket } from "@/lib/queries";
import { formatCurrency } from "@/lib/utils";

export function UsageChart({ data }: { data: DailyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(34, 211, 238, 0.06)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          stroke="#64748b"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          stroke="#64748b"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          cursor={{ fill: "rgba(34, 211, 238, 0.05)" }}
          contentStyle={{
            background: "rgba(12, 21, 28, 0.95)",
            border: "1px solid rgba(34, 211, 238, 0.2)",
            borderRadius: "8px",
            color: "#f4f4f5",
            fontSize: "12px",
          }}
          labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
          formatter={(value, name) => {
            const v = Number(value ?? 0);
            return name === "cost"
              ? [formatCurrency(v), "Cost"]
              : [v.toLocaleString(), String(name)];
          }}
        />
        <Bar dataKey="cost" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
