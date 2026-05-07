"use client";

import { useState, useTransition } from "react";
import { Ban, RotateCcw, Eraser, Trash2 } from "lucide-react";
import { setUserDisabled, wipeUserData, deleteUser } from "./actions";

interface Props {
  userId: string;
  userEmail: string;
  isDisabled: boolean;
  isAdminEmail: boolean;
  isSelf: boolean;
}

export function AdminControls({ userId, userEmail, isDisabled, isAdminEmail, isSelf }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Hide the panel for the admin viewing themselves — none of these actions
  // are valid in that case.
  if (isSelf || isAdminEmail) return null;

  function withErrorBoundary<T>(fn: () => Promise<T>) {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function onToggleDisabled() {
    const verb = isDisabled ? "re-enable" : "disable";
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${userEmail}'s access?`)) return;
    withErrorBoundary(() => setUserDisabled(userId, !isDisabled));
  }

  function onWipe() {
    if (
      !confirm(
        `Wipe ALL usage data for ${userEmail}? This deletes their events, snapshots, and machines. The user account itself stays.`,
      )
    )
      return;
    withErrorBoundary(() => wipeUserData(userId));
  }

  function onDelete() {
    const typed = prompt(
      `This permanently deletes ${userEmail} and ALL their data. Type DELETE to confirm.`,
    );
    if (typed !== "DELETE") return;
    withErrorBoundary(() => deleteUser(userId));
  }

  return (
    <div
      className="rounded-2xl"
      style={{
        background: "var(--ink)",
        color: "var(--tx-on-ink)",
        boxShadow: "var(--shadow-ink)",
      }}
    >
      <div className="border-b border-white/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold">Admin controls</h2>
        <p className="mt-1 text-[12px]" style={{ color: "var(--tx-on-ink-md)" }}>
          Disable or wipe this user. These actions take effect immediately.
        </p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <ActionTile
          icon={isDisabled ? RotateCcw : Ban}
          label={isDisabled ? "Re-enable access" : "Disable access"}
          hint={
            isDisabled
              ? "Restore login + agent ingest."
              : "Sign them out and reject agent uploads."
          }
          onClick={onToggleDisabled}
          tone={isDisabled ? "mint" : "amber"}
          disabled={pending}
        />
        <ActionTile
          icon={Eraser}
          label="Wipe usage data"
          hint="Delete events, snapshots, machines."
          onClick={onWipe}
          tone="violet"
          disabled={pending}
        />
        <ActionTile
          icon={Trash2}
          label="Delete user"
          hint="Permanently remove the account."
          onClick={onDelete}
          tone="rose"
          disabled={pending}
        />
      </div>
      {error && (
        <div
          className="mx-5 mb-5 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: "rgba(217, 76, 92, 0.18)", color: "#FFB3BC" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function ActionTile({
  icon: Icon,
  label,
  hint,
  onClick,
  tone,
  disabled,
}: {
  icon: typeof Ban;
  label: string;
  hint: string;
  onClick: () => void;
  tone: "mint" | "amber" | "violet" | "rose";
  disabled?: boolean;
}) {
  const toneBg: Record<typeof tone, string> = {
    mint: "var(--mint-400)",
    amber: "var(--amber-400)",
    violet: "var(--violet-400)",
    rose: "var(--rose-400)",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-start gap-3 rounded-xl border border-white/5 bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
    >
      <span
        className="grid size-9 place-items-center rounded-lg"
        style={{ background: toneBg[tone], color: "var(--ink)" }}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--tx-on-ink-md)" }}>
          {hint}
        </div>
      </div>
    </button>
  );
}
