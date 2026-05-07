"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Terminal, Cpu, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface MachineInfo {
  id: string;
  install_token: string;
  name: string;
  last_seen_at: string | null;
}

export function OnboardingClient() {
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [waitingForFirstSync, setWaitingForFirstSync] = useState(false);
  const [agentSeen, setAgentSeen] = useState(false);

  useEffect(() => {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const ua = navigator.userAgent;
    const platform = /Mac/.test(ua) ? "macOS" : /Win/.test(ua) ? "Windows" : "Linux";
    setName(`${platform} laptop`);

    const supabase = createClient();
    supabase
      .from("machines")
      .select("id, install_token, name, last_seen_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setMachine(data as MachineInfo);
          if (data.last_seen_at) setAgentSeen(true);
        }
      });
    void hostname;
  }, []);

  useEffect(() => {
    if (!machine || agentSeen) return;
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("machines")
        .select("last_seen_at")
        .eq("id", machine.id)
        .maybeSingle();
      if (data?.last_seen_at) {
        setAgentSeen(true);
        setWaitingForFirstSync(false);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [machine, agentSeen]);

  async function createMachine() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    const ua = navigator.userAgent;
    const platform = /Mac/.test(ua) ? "darwin" : /Win/.test(ua) ? "win32" : "linux";
    const { data, error: err } = await supabase
      .from("machines")
      .insert({
        user_id: userResp.user.id,
        name: name || "My machine",
        platform,
      })
      .select("id, install_token, name, last_seen_at")
      .single();
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMachine(data as MachineInfo);
    setWaitingForFirstSync(true);
  }

  return (
    <div className="space-y-6">
      <Step
        n={1}
        title="Install Node.js (skip if you have it)"
        icon={Terminal}
        done={true}
      >
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          The agent needs Node.js 20 or later. Check your version:
        </p>
        <CodeBlock code="node --version" />
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          If you see a version below v20 or get &ldquo;command not found&rdquo;, install from{" "}
          <a
            href="https://nodejs.org"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent-to)] hover:underline"
          >
            nodejs.org
          </a>{" "}
          (LTS).
        </p>
      </Step>

      <Step
        n={2}
        title="Register this machine"
        icon={Cpu}
        done={!!machine}
        active={!machine}
      >
        {!machine ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Give this machine a name. You&apos;ll get an install token tied to your account.
            </p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MacBook Pro M3"
                className="h-10 flex-1 rounded-lg px-3 text-sm"
              />
              <Button onClick={createMachine} loading={loading}>
                Generate token
              </Button>
            </div>
            {error && (
              <div className="rounded-lg border border-[rgba(217,76,92,0.3)] bg-[rgba(217,76,92,0.08)] p-3 text-xs text-[#B5374A]">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <Check className="size-4" />
              Registered as <strong>{machine.name}</strong>
            </div>
          </div>
        )}
      </Step>

      <Step
        n={3}
        title="Install the agent"
        icon={Terminal}
        done={agentSeen}
        active={!!machine && !agentSeen}
        disabled={!machine}
      >
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          Run this in your terminal. It downloads the tracker and starts it in the background.
        </p>
        <CodeBlock
          code={
            machine
              ? `TC_TOKEN=${machine.install_token} TC_SERVER=${
                  typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app"
                } bash <(curl -fsSL ${
                  typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app"
                }/api/agent/install)`
              : "Generate a token in step 2 first."
          }
          locked={!machine}
        />
        <details className="mt-3 text-xs text-[var(--muted-foreground)]">
          <summary className="cursor-pointer hover:text-[var(--tx-hi)]">What does this do?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Installs <code className="text-[var(--tx-hi)]">codeburn</code> globally if missing.</li>
            <li>Drops a small agent script at <code className="text-[var(--tx-hi)]">~/.tokencalc/agent.js</code> and schedules it (launchd on macOS, cron on Linux) every 15 min.</li>
            <li>Sends only token counts, model names, project paths and timestamps. Never prompts or code.</li>
            <li>Uninstall: <code className="text-[var(--tx-hi)]">node ~/.tokencalc/agent.js uninstall</code></li>
          </ul>
        </details>
      </Step>

      <Step
        n={4}
        title="Verify it's working"
        icon={Activity}
        done={agentSeen}
        active={waitingForFirstSync && !agentSeen}
        disabled={!machine}
      >
        {agentSeen ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <div className="flex items-center gap-2 text-[var(--ink)]">
              <Check className="size-4" />
              Agent connected. Your usage will appear in the Overview within a few minutes.
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
            <Loader2 className="size-4 animate-spin text-[var(--accent-to)]" />
            <span>
              Waiting for the agent&apos;s first ping… run the install command above.
            </span>
          </div>
        )}
      </Step>

      {agentSeen && (
        <a
          href="/dashboard"
          className="block rounded-2xl gradient-bg px-6 py-4 text-center text-sm font-semibold text-black"
        >
          Go to Overview →
        </a>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  icon: Icon,
  done,
  active,
  disabled,
  children,
}: {
  n: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  done?: boolean;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-6 transition-all",
        active && "border-[var(--accent-to)]/40 glow-cyan",
        disabled && "opacity-60",
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg text-sm font-semibold",
            done
              ? "bg-[var(--bg-300)] text-[var(--ink)]"
              : active
                ? "gradient-bg text-black"
                : "bg-[var(--card-elevated)] text-[var(--muted-foreground)]",
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </div>
        <div className="flex flex-1 items-center gap-2">
          <Icon className="size-4 text-[var(--muted-foreground)]" />
          <h3 className="text-base font-semibold text-[var(--tx-hi)]">{title}</h3>
        </div>
      </div>
      <div className="pl-12">{children}</div>
    </div>
  );
}

function CodeBlock({ code, locked }: { code: string; locked?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (locked) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg font-mono",
        locked && "cursor-not-allowed opacity-60",
      )}
      style={{ background: "var(--ink)", color: "var(--tx-on-ink)" }}
    >
      <pre
        className="overflow-x-auto p-3 pr-12 text-xs"
        style={{ color: "var(--tx-on-ink)" }}
      >
        {code}
      </pre>
      <button
        onClick={copy}
        disabled={locked}
        className="absolute right-2 top-2 rounded-md bg-[var(--card)] p-1.5 text-[var(--muted-foreground)] opacity-0 transition-all hover:text-[var(--tx-hi)] group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
