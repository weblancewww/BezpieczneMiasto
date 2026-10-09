"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  location: {
    name: string;
    address: string;
  } | null;
};

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

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const query = searchParams.get("q") ?? "";
  const statusFilter = (searchParams.get("status") as ReportStatus | null) ?? "ALL";

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch("/api/reports", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać zgłoszeń");
        }

        const data = (await response.json()) as ReportRow[];

        if (active) {
          setReports(data);
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
      if (statusFilter !== "ALL" && report.status !== statusFilter) {
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

  function setStatusFilter(next: "ALL" | ReportStatus) {
    const params = new URLSearchParams(searchParams.toString());

    if (next === "ALL") {
      params.delete("status");
    } else {
      params.set("status", next);
    }

    router.replace(`/reports${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const chips: { key: "ALL" | ReportStatus; label: string; count: number }[] = [
    { key: "ALL", label: "Wszystkie", count: reports.length },
    ...STATUS_ORDER.map((status) => ({
      key: status,
      label: reportStatusLabel[status],
      count: counts[status] ?? 0,
    })),
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
                <th>Zgłaszający</th>
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
                  <td>
                    <div className="t-main" style={{ fontWeight: 500 }}>
                      {report.reporterName}
                    </div>
                    <div className="t-sub">{report.reporterPhone || report.reporterEmail}</div>
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
