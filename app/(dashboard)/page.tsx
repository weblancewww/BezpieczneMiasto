import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsMap } from "@/components/map/reports-map";
import type { ReportStatus } from "@/lib/utils";

const STATUS_META: { key: ReportStatus; label: string; cls: string }[] = [
  { key: "NEW", label: "Nowe", cls: "new" },
  { key: "ANALYSIS", label: "Podjęte do analizy", cls: "analysis" },
  { key: "IN_PROGRESS", label: "W trakcie rozwiązywania", cls: "progress" },
  { key: "RESOLVED", label: "Rozwiązane", cls: "resolved" },
];

function shortCode(id: string) {
  return `#${id.substring(0, 8).toUpperCase()}`;
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const reportWhere = isSuperAdmin ? {} : { organizationId: session.user.organizationId };
  const locationWhere = isSuperAdmin ? {} : { organizationId: session.user.organizationId };

  const [
    newCount,
    analysisCount,
    inProgressCount,
    resolvedCount,
    totalReports,
    locationsCount,
    recentReports,
    byOrganization,
    organizations,
  ] = await Promise.all([
    prisma.report.count({ where: { ...reportWhere, status: "NEW" } }),
    prisma.report.count({ where: { ...reportWhere, status: "ANALYSIS" } }),
    prisma.report.count({ where: { ...reportWhere, status: "IN_PROGRESS" } }),
    prisma.report.count({ where: { ...reportWhere, status: "RESOLVED" } }),
    prisma.report.count({ where: reportWhere }),
    prisma.location.count({ where: locationWhere }),
    prisma.report.findMany({
      where: reportWhere,
      include: { location: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.report.groupBy({
      by: ["organizationId"],
      where: reportWhere,
      _count: { _all: true },
    }),
    prisma.organization.findMany({ select: { id: true, name: true } }),
  ]);

  const counts: Record<string, number> = {
    NEW: newCount,
    ANALYSIS: analysisCount,
    IN_PROGRESS: inProgressCount,
    RESOLVED: resolvedCount,
  };

  const markers = recentReports.map((report) => ({
    id: report.id,
    status: report.status as ReportStatus,
    locationName: report.reportPlaceName || report.location?.name || "Punkt zgłoszenia",
    latitude: report.reportLatitude ?? report.location?.latitude ?? 52.069,
    longitude: report.reportLongitude ?? report.location?.longitude ?? 19.48,
  }));

  const orgNames = new Map(organizations.map((org) => [org.id, org.name]));

  const bars = byOrganization
    .map((row) => ({
      name: (row.organizationId && orgNames.get(row.organizationId)) || "Nieprzypisane",
      value: row._count._all,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const maxBar = Math.max(...bars.map((bar) => bar.value), 1);
  const total = Math.max(totalReports, 1);

  return (
    <>
      <section>
        <div className="kpis">
          {STATUS_META.map((status) => {
            const value = counts[status.key] ?? 0;

            return (
              <div className="kpi" key={status.key}>
                <div className="k-top">
                  <span className="k-dot" style={{ background: `var(--${status.cls})` }} />
                  <span className="k-label">{status.label}</span>
                </div>
                <div className="k-num">{String(value).padStart(2, "0")}</div>
                <div className="k-foot">
                  <span>{Math.round((value / total) * 100)}% wszystkich zgłoszeń</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dash-grid">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <h2>Lokalizacje i zgłoszenia</h2>
            <span className="hint">
              {locationsCount} punktów · {totalReports} zgłoszeń
            </span>
          </div>
          <div className="map">
            <ReportsMap markers={markers} />
          </div>
        </div>

        <div className="stack">
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="card-head">
              <h2>Ostatnie zgłoszenia</h2>
              <Link className="btn btn-ghost btn-sm" href="/reports">
                Wszystkie <ChevronRight size={15} />
              </Link>
            </div>
            {recentReports.length === 0 ? (
              <div className="empty">
                <FileText />
                <p>Brak zgłoszeń.</p>
              </div>
            ) : (
              <ul className="recent">
                {recentReports.slice(0, 6).map((report) => {
                  const meta =
                    STATUS_META.find((status) => status.key === report.status) ?? STATUS_META[0];

                  return (
                    <li key={report.id}>
                      <Link href={`/reports/${report.id}`}>
                        <span className="r-code">{shortCode(report.id)}</span>
                        <span className="r-main">
                          <div className="r-place">
                            {report.reportPlaceName || report.location?.name || "Punkt zgłoszenia"}
                          </div>
                          <div className="r-desc">{report.description}</div>
                        </span>
                        <span className={`pill ${meta.cls}`}>{meta.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Zgłoszenia wg gminy</h2>
              <span className="hint">top 6</span>
            </div>
            <div className="card-body">
              {bars.length === 0 ? (
                <p className="hintline">Brak danych do wyświetlenia.</p>
              ) : (
                <div className="bars">
                  {bars.map((bar) => (
                    <div className="bar-row" key={bar.name}>
                      <div>
                        <div className="b-name">
                          {bar.name}
                          <span>{bar.value}</span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${(bar.value / maxBar) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="b-val">{bar.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
