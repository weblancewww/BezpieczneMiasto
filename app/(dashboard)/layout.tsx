"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Building2,
  ChevronDown,
  FileText,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  RefreshCw,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { Suspense } from "react";
import { TopbarSearch } from "@/components/layout/topbar-search";

const NAV = [
  { href: "/", id: "map", label: "Mapa", crumb: "Podgląd operacyjny regionu", icon: MapIcon },
  { href: "/reports", id: "reports", label: "Zgłoszenia", crumb: "Rejestr zgłoszeń usterek", icon: FileText },
  { href: "/locations", id: "locations", label: "Lokalizacje", crumb: "Punkty zgłoszeń i kody QR", icon: MapPin },
  { href: "/users", id: "users", label: "Użytkownicy", crumb: "Konta i uprawnienia", icon: Users },
  { href: "/organizations", id: "orgs", label: "Organizacje", crumb: "Hierarchia powiat i gminy", icon: Building2 },
  { href: "/settings", id: "settings", label: "Ustawienia", crumb: "Profil i poczta SMTP", icon: Settings },
] as const;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrator",
  MODERATOR: "Moderator",
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reportCount, setReportCount] = useState<number | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    let active = true;

    fetch("/api/reports", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (active && Array.isArray(data)) setReportCount(data.length);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const activeId = useMemo(() => {
    if (pathname === "/") return "map";
    const match = NAV.find((item) => item.id !== "map" && pathname.startsWith(item.href));
    return match?.id ?? "map";
  }, [pathname]);

  const activeNav = NAV.find((item) => item.id === activeId) ?? NAV[0];

  const title = useMemo(() => {
    if (pathname.startsWith("/reports/")) return "Szczegóły zgłoszenia";
    if (pathname.startsWith("/locations/new")) return "Nowa lokalizacja";
    if (/^\/locations\/[^/]+\/edit/.test(pathname)) return "Edycja lokalizacji";
    return activeId === "map" ? "Mapa operacyjna" : activeNav.label;
  }, [pathname, activeId, activeNav.label]);

  function refresh() {
    router.refresh();
    toast.success("Dane odświeżone");
  }

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="mark">
            <Shield />
          </span>
          <span>
            <span className="name">Bezpieczne Miasto</span>
            <div className="sub">Panel Operacyjny</div>
          </span>
        </div>

        <Link className="orgswitch" href="/organizations" aria-label="Zmień organizację" onClick={() => setSidebarOpen(false)}>
          <span className="dot" />
          <span style={{ flex: 1, textAlign: "left" }}>
            <span className="o-name">{session?.user?.organizationName || "Brak organizacji"}</span>
            <div className="o-type">{ROLE_LABELS[session?.user?.role ?? ""] ?? "Jednostka"}</div>
          </span>
          <ChevronDown size={16} style={{ color: "var(--muted)" }} />
        </Link>

        <nav>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`navlink${activeId === item.id ? " active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                <span>{item.label}</span>
                {item.id === "reports" && reportCount !== null ? (
                  <span className="count">{reportCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidefoot">
          <div className="userchip">
            <span className="av">{initials(session?.user?.name)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="u-name">{session?.user?.name || "Użytkownik"}</span>
              <div className="u-role">{ROLE_LABELS[session?.user?.role ?? ""] ?? "Konto"}</div>
            </span>
          </div>
          <button
            type="button"
            className="navlink"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut />
            <span>Wyloguj się</span>
          </button>
        </div>
      </aside>

      {sidebarOpen ? (
        <div className="scrim open" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      ) : null}

      <div className="main">
        <header className="topbar">
          <div className="topbar-in">
            <button
              type="button"
              className="iconbtn menubtn"
              aria-label="Menu"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <Menu />
            </button>
            <div>
              <h1>{title}</h1>
              <div className="crumb">
                {session?.user?.organizationName
                  ? `${session.user.organizationName} · ${activeNav.crumb}`
                  : activeNav.crumb}
              </div>
            </div>
            <div className="spacer" />
            <Suspense fallback={<div className="search" aria-hidden="true" />}>
              <TopbarSearch />
            </Suspense>
            <button type="button" className="iconbtn" onClick={refresh} aria-label="Odśwież" title="Odśwież dane">
              <RefreshCw />
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
