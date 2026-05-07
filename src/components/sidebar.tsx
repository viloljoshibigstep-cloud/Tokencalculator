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

const SECTIONS: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[];
}[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/team", label: "Team", icon: Users, adminOnly: true },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/tools", label: "Tools / IDEs", icon: Boxes },
      { href: "/models", label: "Models", icon: Cpu },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/onboarding", label: "Install agent", icon: Download },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="hidden w-[248px] shrink-0 flex-col gap-8 border-r p-5 md:flex"
      style={{
        background: "var(--bg-050)",
        borderColor: "var(--line)",
      }}
    >
      <Link href="/dashboard" className="px-1 pt-1">
        <Logo />
      </Link>

      <nav className="flex-1">
        {SECTIONS.map((section) => {
          const visible = section.items.filter((it) => !it.adminOnly || user.role === "admin");
          if (visible.length === 0) return null;
          return (
            <div key={section.label} className="mb-4">
              <div
                className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--tx-lo)" }}
              >
                {section.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      )}
                      style={
                        active
                          ? {
                              background: "var(--ink)",
                              color: "var(--tx-on-ink)",
                            }
                          : { color: "var(--tx-md)" }
                      }
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "var(--bg-300)";
                          e.currentTarget.style.color = "var(--tx-hi)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--tx-md)";
                        }
                      }}
                    >
                      <Icon
                        className="size-[18px] shrink-0"
                        style={{ color: active ? "var(--mint-400)" : "var(--tx-lo)" }}
                      />
                      <span>{item.label}</span>
                      {active && (
                        <span
                          className="ml-auto size-1.5 rounded-full"
                          style={{
                            background: "var(--mint-400)",
                            boxShadow: "0 0 10px var(--mint-400)",
                          }}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className="mt-auto rounded-[18px] p-3.5"
        style={{ background: "var(--ink)", color: "var(--tx-on-ink)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-full text-xs font-semibold"
            style={{ background: "var(--grad-brand)", color: "var(--ink)" }}
          >
            {(user.full_name || user.email)[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">
              {user.full_name || user.email.split("@")[0]}
            </div>
            <div
              className="truncate text-[11px]"
              style={{ color: "var(--tx-on-ink-md)" }}
            >
              {user.role === "admin" ? "Admin" : "Member"}
            </div>
          </div>
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded-md p-1.5 transition-colors hover:bg-white/10"
            style={{ color: "var(--tx-on-ink-md)" }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
