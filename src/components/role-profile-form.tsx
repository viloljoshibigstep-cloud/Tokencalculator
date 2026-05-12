"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
  JOB_ROLES,
  DEPARTMENTS,
  SENIORITY_OPTIONS,
  PATTERN_OPTIONS,
  TASK_TYPES,
} from "@/lib/role-profile";
import type {
  ExpectedPattern,
  ProfileQuestionnaire,
  Seniority,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

interface Props {
  initial?: ProfileQuestionnaire | null;
  onSaved?: (q: ProfileQuestionnaire) => void;
  submitLabel?: string;
  compact?: boolean;
}

export function RoleProfileForm({ initial, onSaved, submitLabel = "Save profile", compact }: Props) {
  const [jobRole, setJobRole] = useState(initial?.job_role ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [seniority, setSeniority] = useState<Seniority | "">(
    (initial?.seniority as Seniority | null) ?? "",
  );
  const [pattern, setPattern] = useState<ExpectedPattern | "">(
    (initial?.expected_pattern as ExpectedPattern | null) ?? "",
  );
  const [team, setTeam] = useState(initial?.team ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [tasks, setTasks] = useState<string[]>(initial?.task_types ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTask(t: string) {
    setTasks((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobRole || !seniority || !pattern || tasks.length === 0) {
      setError("Job role, seniority, usage pattern, and at least one task type are required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      setError("Not signed in");
      setSaving(false);
      return;
    }
    const update = {
      job_role: jobRole,
      department: department || null,
      seniority,
      expected_pattern: pattern,
      task_types: tasks,
      team: team || null,
      industry: industry || null,
      profile_completed_at: new Date().toISOString(),
    };
    const { error: err } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userResp.user.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved?.(update as unknown as ProfileQuestionnaire);
  }

  return (
    <form onSubmit={submit} className={cn("space-y-5", compact && "space-y-4")}>
      <Row label="Job role *">
        <Select
          value={jobRole}
          onChange={(v) => setJobRole(v)}
          placeholder="Pick your role"
          options={JOB_ROLES.map((r) => ({ value: r, label: r }))}
        />
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row label="Seniority *">
          <Select
            value={seniority}
            onChange={(v) => setSeniority(v as Seniority)}
            placeholder="Pick a level"
            options={SENIORITY_OPTIONS}
          />
        </Row>
        <Row label="Department">
          <Select
            value={department}
            onChange={(v) => setDepartment(v)}
            placeholder="Optional"
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
          />
        </Row>
      </div>

      <Row label="Expected AI usage pattern *">
        <div className="grid gap-2 sm:grid-cols-3">
          {PATTERN_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPattern(p.value)}
              className={cn(
                "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all",
                pattern === p.value
                  ? "border-[var(--accent-to)]/60 bg-[var(--accent-to)]/8"
                  : "border-[var(--border-strong)] hover:bg-[var(--card-elevated)]",
              )}
            >
              <span className="text-sm font-medium text-white">{p.label}</span>
              <span className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                {p.hint}
              </span>
            </button>
          ))}
        </div>
      </Row>

      <Row label="What do you mainly use AI for? *" hint="Pick all that apply.">
        <div className="flex flex-wrap gap-2">
          {TASK_TYPES.map((t) => {
            const active = tasks.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTask(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-all",
                  active
                    ? "border-[var(--accent-to)]/60 bg-[var(--accent-to)]/10 text-white"
                    : "border-[var(--border-strong)] text-[var(--muted-foreground)] hover:text-white",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Row>

      <div className="grid gap-4 sm:grid-cols-2">
        <Row label="Team" hint="Optional. E.g. Payments, Growth.">
          <Input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="e.g. Payments"
          />
        </Row>
        <Row label="Industry" hint="Optional.">
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Fintech"
          />
        </Row>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      <Button type="submit" loading={saving} size="lg" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--muted-foreground)]">
        {label}
      </label>
      {children}
      {hint && (
        <div className="mt-1 text-[11px] text-[var(--muted-foreground)]/80">
          {hint}
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 w-full rounded-lg px-3 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
