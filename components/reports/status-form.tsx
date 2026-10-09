"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { reportStatusLabel, type ReportStatus } from "@/lib/utils";

const STATUS_ORDER: ReportStatus[] = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"];

type Props = {
  reportId: string;
  currentStatus: ReportStatus;
};

export function StatusForm({ reportId, currentStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ReportStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (status === currentStatus && !note.trim()) {
      toast.info("Wybierz nowy status lub dodaj notatkę.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/reports/${reportId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać statusu");
      }

      toast.success(`Status zmieniony na „${reportStatusLabel[status]}”`);
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu statusu");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
      <div className="field">
        <label htmlFor="status">Nowy status</label>
        <select
          id="status"
          className="select"
          value={status}
          onChange={(event) => setStatus(event.target.value as ReportStatus)}
        >
          {STATUS_ORDER.map((option) => (
            <option key={option} value={option}>
              {reportStatusLabel[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="status-note">Notatka do zmiany</label>
        <textarea
          id="status-note"
          className="textarea"
          placeholder="Co zostało ustalone lub wykonane…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="inline justify-end">
        <button type="submit" className="btn btn-primary" disabled={isSaving}>
          <Check size={17} />
          {isSaving ? "Zapisywanie…" : "Zapisz status"}
        </button>
      </div>
    </form>
  );
}
