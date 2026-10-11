"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { reportStatusLabel, type ReportStatus } from "@/lib/utils";

type ReportRow = {
  id: string;
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string;
  description: string;
  status: ReportStatus;
  createdAt: string;
  reportPlaceName: string | null;
  reportAddress: string | null;
  organizationId: string | null;
  assignedManually: boolean;
  organization: { id: string; name: string } | null;
  location: {
    name: string;
    address: string;
  } | null;
};

type Filter = "ALL" | ReportStatus | "UNASSIGNED";

const STATUS_ORDER: ReportStatus[] = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"];

const STATUS_CLASS: Record<ReportStatus, string> = {
  NEW: "new",
  ANALYSIS: "analysis",
  IN_PROGRESS: "progress",
  RESOLVED: "resolved",
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const query = searchParams.get("q") ?? "";
  const statusFilter = (searchParams.get("status") as Filter | null) ?? "ALL";

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [reportsResponse, organizationsResponse] = await Promise.all([
          fetch("/api/reports", { cache: "no-store" }),
          fetch("/api/organizations", { cache: "no-store" }),
        ]);

        if (!reportsResponse.ok) {
          throw new Error("Nie udało się pobrać zgłoszeń");
        }

        const data = (await reportsResponse.json()) as ReportRow[];
        const orgData = organizationsResponse.ok
          ? ((await organizationsResponse.json()) as { id: string; name: string }[])
          : [];

        if (active) {
          setReports(data);
          setOrganizations(orgData.map((org) => ({ id: org.id, name: org.name })));
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Błąd ładowania");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return reports.filter((report) => {
      if (statusFilter === "UNASSIGNED") {
        if (report.organizationId) {
          return false;
        }
      } else if (statusFilter !== "ALL" && report.status !== statusFilter) {
        return false;
      }

      if (!lowered) {
        return true;
      }

      return (
        report.reporterName.toLowerCase().includes(lowered) ||
        report.reporterEmail.toLowerCase().includes(lowered) ||
        (report.reportPlaceName || report.location?.name || "").toLowerCase().includes(lowered) ||
        report.description.toLowerCase().includes(lowered) ||
        report.id.toLowerCase().includes(lowered)
      );
    });
  }, [query, reports, statusFilter]);

  const counts = useMemo(
    () =>
      STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = reports.filter((report) => report.status === status).length;
          return acc;
        },
        {} as Record<ReportStatus, number>
      ),
    [reports]
  );

  const unassignedCount = useMemo(
    () => reports.filter((report) => !report.organizationId).length,
    [reports]
  );

  function setStatusFilter(next: Filter) {
    const params = new URLSearchParams(searchParams.toString());

    if (next === "ALL") {
      params.delete("status");
    } else {
      params.set("status", next);
    }

    router.replace(`/reports${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function assignReport(reportId: string, organizationId: string) {
    try {
      const response = await fetch(`/api/reports/${reportId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się przypisać zgłoszenia");
      }

      setReports((current) =>
        current.map((report) =>
          report.id === reportId
            ? {
                ...report,
                organizationId: result.report.organization.id,
                organization: result.report.organization,
                assignedManually: true,
              }
            : report
        )
      );

      toast.success(`Zgłoszenie przypisane do ${result.report.organization.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd przypisania");
    }
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "Wszystkie", count: reports.length },
    ...STATUS_ORDER.map((status) => ({
      key: status as Filter,
      label: reportStatusLabel[status],
      count: counts[status] ?? 0,
    })),
    ...(isSuperAdmin && unassignedCount > 0
      ? [{ key: "UNASSIGNED" as Filter, label: "Nieprzypisane", count: unassignedCount }]
      : []),
  ];

  return (
    <>
      <section>
        <div className="toolbar">
          <div className="chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`chip${statusFilter === chip.key ? " active" : ""}`}
                onClick={() => setStatusFilter(chip.key)}
              >
                {chip.label}
                <span className="c-n">{chip.count}</span>
              </button>
            ))}
          </div>
          <div className="spacer" />
          <span className="hintline num">
            {filtered.length} z {reports.length}
          </span>
        </div>
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div className="empty">
            <p>Ładowanie zgłoszeń…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Search />
            <p>Brak zgłoszeń spełniających kryteria.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Miejsce i opis</th>
                <th>Jednostka</th>
                <th>Data</th>
                <th>Status</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <tr key={report.id} onClick={() => router.push(`/reports/${report.id}`)}>
                  <td className="t-code">#{report.id.substring(0, 8).toUpperCase()}</td>
                  <td>
                    <div className="t-main">
                      {report.reportPlaceName || report.location?.name || "Punkt zgłoszenia"}
                    </div>
                    <div className="t-sub">{report.description}</div>
                  </td>
                  <td onClick={(event) => event.stopPropagation()}>
                    {report.organization ? (
                      <>
                        <span className="tag">{report.organization.name}</span>
                        {report.assignedManually ? (
                          <div className="t-sub">przypisane ręcznie</div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className="pill new">Nieprzypisane</span>
                        {isSuperAdmin ? (
                          <select
                            className="select"
                            style={{ marginTop: 8, height: 34, padding: "0 10px", fontSize: 12.5 }}
                            defaultValue=""
                            aria-label="Przypisz zgłoszenie do organizacji"
                            onChange={(event) => {
                              const value = event.target.value;
                              event.target.value = "";
                              if (value) void assignReport(report.id, value);
                            }}
                          >
                            <option value="">Przypisz do…</option>
                            {organizations.map((organization) => (
                              <option key={organization.id} value={organization.id}>
                                {organization.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="num-col" style={{ textAlign: "left" }}>
                    {formatDate(report.createdAt)}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_CLASS[report.status]}`}>
                      {reportStatusLabel[report.status]}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", width: 40, color: "var(--muted)" }}>
                    <span aria-hidden="true">›</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="empty">
          <p>Ładowanie zgłoszeń…</p>
        </div>
      }
    >
      <ReportsContent />
    </Suspense>
  );
}
