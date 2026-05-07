import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const { data: machines = [] } = await supabase
    .from("machines")
    .select("id, name, hostname, platform, last_seen_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar title="Settings" subtitle="Your profile and registered machines" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-6">
          <h2 className="mb-5 text-sm font-semibold text-[var(--tx-hi)]">Profile</h2>
          <Field label="Name" value={profile?.full_name ?? "—"} />
          <Field label="Email" value={profile?.email ?? user.email ?? "—"} />
          <Field
            label="Role"
            value={profile?.role === "admin" ? "Admin" : "Member"}
          />
          <Field
            label="Joined"
            value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString()
                : "—"
            }
          />
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h2 className="mb-5 text-sm font-semibold text-[var(--tx-hi)]">Machines</h2>
          {(machines ?? []).length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No machines registered yet. Install the agent on your dev machine to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {(machines ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border-strong)] bg-[var(--card)] p-3"
                >
                  <div>
                    <div className="font-medium text-[var(--tx-hi)]">{m.name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">
                      {m.hostname} · {m.platform}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[var(--muted-foreground)]">last seen</div>
                    <div className="text-xs font-medium text-[var(--tx-hi)]">
                      {m.last_seen_at
                        ? new Date(m.last_seen_at).toLocaleString()
                        : "never"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--border)] py-3 text-sm last:border-0">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium text-[var(--tx-hi)]">{value}</span>
    </div>
  );
}
