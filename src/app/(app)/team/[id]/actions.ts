"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "vilol.joshi@bigsteptech.com";

// Resolve the caller and assert they are the hardcoded admin. Throws (which
// surfaces as a server action error in the form's onError boundary) if not.
async function assertAdmin(): Promise<{ adminId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  // The DB trigger already enforces the email lock, but check here too so
  // we can return a clean error before doing any work.
  if ((user.email || "").toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("Forbidden");
  }
  return { adminId: user.id };
}

export async function setUserDisabled(
  userId: string,
  disabled: boolean,
  reason?: string,
): Promise<{ ok: true }> {
  const { adminId } = await assertAdmin();
  if (userId === adminId) throw new Error("Cannot disable yourself");

  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({
      disabled_at: disabled ? new Date().toISOString() : null,
      disabled_reason: disabled ? (reason || null) : null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  revalidatePath(`/team/${userId}`);
  revalidatePath("/team");
  return { ok: true };
}

export async function wipeUserData(userId: string): Promise<{ ok: true }> {
  await assertAdmin();
  const admin = createServiceClient();

  // Order matters: events + snapshots are scoped by user_id; machines come
  // last so we don't lose the install_token until the data is gone.
  const errors: string[] = [];
  for (const table of ["usage_events", "agent_snapshots", "machines"] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) errors.push(`${table}: ${error.message}`);
  }
  if (errors.length > 0) throw new Error(errors.join("; "));

  revalidatePath(`/team/${userId}`);
  revalidatePath("/team");
  return { ok: true };
}

export async function deleteUser(userId: string): Promise<void> {
  const { adminId } = await assertAdmin();
  if (userId === adminId) throw new Error("Cannot delete yourself");

  const admin = createServiceClient();

  // Belt-and-suspenders: clear our public tables first, then delete the auth
  // record. The auth.users CASCADE would handle most of this, but doing it
  // explicitly keeps the operation safe even if FK constraints get loosened.
  await admin.from("usage_events").delete().eq("user_id", userId);
  await admin.from("agent_snapshots").delete().eq("user_id", userId);
  await admin.from("machines").delete().eq("user_id", userId);
  await admin.from("budgets").delete().eq("user_id", userId);
  // profile cascades from auth.users delete

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);

  revalidatePath("/team");
  redirect("/team");
}
