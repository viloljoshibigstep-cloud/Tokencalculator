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
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 14, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A6F291" stopOpacity={1} />
            <stop offset="100%" stopColor="#7FE066" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="rgba(20, 24, 26, 0.06)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          stroke="#8A918E"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          stroke="#8A918E"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
        />
        <Tooltip
          cursor={{ fill: "rgba(166, 242, 145, 0.18)" }}
          contentStyle={{
            background: "#14181A",
            border: "0",
            borderRadius: "12px",
            color: "#F2F4F1",
            fontSize: "12px",
            boxShadow: "0 18px 40px -20px rgba(20, 24, 26, 0.5)",
          }}
          labelStyle={{ color: "#9CA3A0", marginBottom: "4px", fontWeight: 600 }}
          formatter={(value, name) => {
            const v = Number(value ?? 0);
            return name === "cost"
              ? [formatCurrency(v), "Cost"]
              : [v.toLocaleString(), String(name)];
          }}
        />
        <Bar dataKey="cost" fill="url(#barFill)" radius={[10, 10, 4, 4]} maxBarSize={46} />
      </BarChart>
    </ResponsiveContainer>
  );
}
