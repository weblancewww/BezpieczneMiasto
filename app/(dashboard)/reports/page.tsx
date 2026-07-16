"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const statusOptions: ReportStatus[] = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"];

function formatDate(date: string) {
  return new Date(date).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>("ALL");
  const [savingReportId, setSavingReportId] = useState<string | null>(null);

  async function fetchReportsList() {
    const response = await fetch("/api/reports", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Nie udało się pobrać zgłoszeń");
    }

    return (await response.json()) as ReportRow[];
  }

  async function loadReports() {
    try {
      setIsLoading(true);
      const data = await fetchReportsList();
      setReports(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd ładowania";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const data = await fetchReportsList();

        if (!active) {
          return;
        }

        setReports(data);
      } catch (error) {
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : "Błąd ładowania";
        toast.error(message);
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

  const filteredReports = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesStatus = statusFilter === "ALL" || report.status === statusFilter;

      if (!matchesStatus) {
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

  async function saveStatus(reportId: string, status: ReportStatus) {
    const previousStatus = reports.find((report) => report.id === reportId)?.status;

    if (!previousStatus || previousStatus === status) {
      return;
    }

    setReports((current) =>
      current.map((report) =>
        report.id === reportId ? { ...report, status } : report
      )
    );

    try {
      setSavingReportId(reportId);
      const response = await fetch(`/api/reports/${reportId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note: "",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać statusu");
      }

      toast.success("Status zgłoszenia został zaktualizowany");
    } catch (error) {
      setReports((current) =>
        current.map((report) =>
          report.id === reportId ? { ...report, status: previousStatus } : report
        )
      );
      const message = error instanceof Error ? error.message : "Błąd zapisu statusu";
      toast.error(message);
    } finally {
      setSavingReportId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-foreground">Zgłoszenia</h1>
        <Button onClick={loadReports} variant="outline" disabled={isLoading}>
          Odśwież
        </Button>
      </div>

      <Card className="neo-card">
        <CardHeader className="space-y-4">
          <CardTitle className="text-foreground">Lista zgłoszeń</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              placeholder="Szukaj po zgłaszającym, lokalizacji, opisie lub ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | ReportStatus)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">Wszystkie statusy</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {reportStatusLabel[status]}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Ładowanie zgłoszeń...</p>
          ) : filteredReports.length === 0 ? (
            <p className="text-muted-foreground">Brak zgłoszeń spełniających kryteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Zgłaszający</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Szczegóły</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">#{report.id.substring(0, 8).toUpperCase()}</TableCell>
                    <TableCell>{formatDate(report.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{report.reportPlaceName || report.location?.name || "Punkt zgłoszenia"}</span>
                        <span className="text-xs text-muted-foreground">{report.reportAddress || report.location?.address || "Brak adresu"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{report.reporterName}</span>
                        <span className="text-xs text-muted-foreground">{report.reporterEmail}</span>
                        <span className="text-xs text-muted-foreground">{report.reporterPhone}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={report.description}>
                      {report.description}
                    </TableCell>
                    <TableCell className="space-y-2">
                      <select
                        value={report.status}
                        onChange={(event) => {
                          void saveStatus(report.id, event.target.value as ReportStatus);
                        }}
                        className="h-11 min-w-[220px] w-full rounded-md border border-input bg-background px-3 text-base"
                        disabled={savingReportId === report.id}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {reportStatusLabel[status]}
                          </option>
                        ))}
                      </select>
                      {savingReportId === report.id ? (
                        <p className="text-xs text-muted-foreground">Zapisywanie...</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Link href={`/reports/${report.id}`}>
                        <Button variant="outline">Szczegóły</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
