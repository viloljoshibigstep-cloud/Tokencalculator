import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  const safeProfile = profile ?? {
    full_name: user.user_metadata?.full_name ?? null,
    email: user.email ?? "",
    role: "member" as const,
  };

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar user={safeProfile} />
      <main className="flex-1 overflow-x-hidden px-6 py-8 md:px-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
