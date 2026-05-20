"use client";

import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Link from "next/link";
import { LogOut, Map, FileText, MapPin, Users, Building2, Settings, Sparkles } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navItems = [
    { href: "/", icon: Map, label: "Mapa" },
    { href: "/reports", icon: FileText, label: "Zgłoszenia" },
    { href: "/locations", icon: MapPin, label: "Lokalizacje" },
    { href: "/users", icon: Users, label: "Użytkownicy" },
    { href: "/organizations", icon: Building2, label: "Organizacje" },
    { href: "/settings", icon: Settings, label: "Ustawienia" },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-transparent text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-72 m-4 mr-0 glass-panel text-[color:var(--sidebar-foreground)] border-[color:var(--sidebar-border)]/70 flex-col rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[color:var(--sidebar-border)]/60">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary mb-3">
            <Sparkles className="h-4 w-4" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Bezpieczne Miasto</h1>
          <p className="text-xs text-[color:var(--sidebar-foreground)]/70 mt-1">
            {session?.user?.organizationName}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link href={item.href} key={item.href}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start rounded-xl transition ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                      : "text-[color:var(--sidebar-foreground)]/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[color:var(--sidebar-border)]/70">
          <Button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full justify-start rounded-xl"
            variant="destructive"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Wyloguj się
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="mx-4 mt-4 rounded-xl border border-border bg-card px-6 py-4 flex items-center justify-between gap-3 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">{session?.user?.name}</h2>
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
