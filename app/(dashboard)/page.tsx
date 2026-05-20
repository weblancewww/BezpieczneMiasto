import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsMap } from "@/components/map/reports-map";

function formatDate(date: Date) {
  return new Date(date).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id || !session.user.organizationId) {
    redirect("/login");
  }

  const reportWhere =
    session.user.role === "SUPER_ADMIN"
      ? {}
      : { organizationId: session.user.organizationId };

  const locationWhere =
    session.user.role === "SUPER_ADMIN"
      ? {}
      : {
          organizationId: session.user.organizationId,
        };

  const [newCount, analysisCount, inProgressCount, resolvedCount, locationsCount, recentReports] =
    await Promise.all([
      prisma.report.count({ where: { ...reportWhere, status: "NEW" } }),
      prisma.report.count({ where: { ...reportWhere, status: "ANALYSIS" } }),
      prisma.report.count({ where: { ...reportWhere, status: "IN_PROGRESS" } }),
      prisma.report.count({ where: { ...reportWhere, status: "RESOLVED" } }),
      prisma.location.count({ where: locationWhere }),
      prisma.report.findMany({
        where: reportWhere,
        include: {
          location: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

  const mapMarkers = recentReports.map((report) => ({
    id: report.id,
    status: report.status,
    locationName: report.reportPlaceName || report.location?.name || "Punkt zgłoszenia",
    latitude: report.reportLatitude ?? report.location?.latitude ?? 52.069,
    longitude: report.reportLongitude ?? report.location?.longitude ?? 19.48,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold text-foreground">Dashboard Operacyjny</h1>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="neo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nowe zgłoszenia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{newCount}</div>
          </CardContent>
        </Card>

        <Card className="neo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              W analizie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{analysisCount}</div>
          </CardContent>
        </Card>

        <Card className="neo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              W trakcie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{inProgressCount}</div>
          </CardContent>
        </Card>

        <Card className="neo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rozwiązane
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{resolvedCount}</div>
          </CardContent>
        </Card>

        <Card className="neo-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lokalizacje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{locationsCount}</div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Mapa</h2>
        <ReportsMap markers={mapMarkers} />
      </section>

      <Card className="neo-card">
        <CardHeader>
          <CardTitle className="text-foreground">Ostatnie zgłoszenia</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReports.length === 0 ? (
            <p className="text-muted-foreground">Brak zgłoszeń w systemie.</p>
          ) : (
            <div className="space-y-3">
              {recentReports.slice(0, 8).map((report) => (
                <div key={report.id} className="rounded-lg border border-border bg-card/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">
                      #{report.id.substring(0, 8).toUpperCase()} · {report.reportPlaceName || report.location?.name || "Punkt zgłoszenia"}
                    </p>
                    <span className="text-xs text-muted-foreground">{formatDate(report.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
