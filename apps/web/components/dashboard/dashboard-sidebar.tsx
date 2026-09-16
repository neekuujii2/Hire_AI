"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  BarChart3,
  Key,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  { href: "/dashboard/talent-pool", label: "Talent Pool", icon: Users },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/api-keys", label: "API Keys", icon: Key },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-line bg-panel">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <Link href="/dashboard" className="flex items-center gap-2 no-underline">
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent">
            HIREAI
          </span>
          <span className="text-[11px] text-faint">·</span>
          <span className="text-[11px] text-muted">Dashboard</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[8px] px-3 py-2 text-[13px] font-medium no-underline transition-colors",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-paper hover:text-ink",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-line px-3 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-muted no-underline transition-colors hover:bg-paper hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to site
        </Link>
      </div>
    </aside>
  );
}
