"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Cpu,
  Settings,
  Download,
  LogOut,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  user: {
    full_name: string | null;
    email: string;
    role: "admin" | "member";
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const items = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/team", label: "Team", icon: Users, adminOnly: true },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/tools", label: "Tools / IDEs", icon: Boxes },
    { href: "/models", label: "Models", icon: Cpu },
    { href: "/onboarding", label: "Install agent", icon: Download },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]/40 p-4 backdrop-blur-md md:flex">
      <Link href="/dashboard" className="mb-8 px-2 pt-2">
        <Logo />
      </Link>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          if (item.adminOnly && user.role !== "admin") return null;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                active
                  ? "bg-[var(--card-elevated)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--card)] hover:text-white",
              )}
            >
              <Icon className={cn("size-4", active && "text-[var(--accent-to)]")} />
              <span className="font-medium">{item.label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full gradient-bg" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--card)] p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full gradient-bg text-xs font-semibold text-black">
            {(user.full_name || user.email)[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">
              {user.full_name || user.email.split("@")[0]}
            </div>
            <div className="truncate text-[11px] text-[var(--muted-foreground)]">
              {user.role === "admin" ? "Admin" : "Member"}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-red-400"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
