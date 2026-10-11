"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type OrganizationOption = { id: string; name: string };

type Props = {
  reportId: string;
  organizationId: string | null;
  organizationName: string | null;
  canAssign: boolean;
};

/**
 * Ręczne przypisanie zgłoszenia. Używane głównie dla zgłoszeń z kolejki
 * „Nieprzypisane", czyli takich, których punkt nie leżał w żadnej granicy.
 */
export function AssignOrganization({
  reportId,
  organizationId,
  organizationName,
  canAssign,
}: Props) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!canAssign) return;

    let active = true;

    fetch("/api/organizations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: OrganizationOption[]) => {
        if (active) {
          setOrganizations(data.map((org) => ({ id: org.id, name: org.name })));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [canAssign]);

  async function assign(nextOrganizationId: string) {
    setIsSaving(true);

    try {
      const response = await fetch(`/api/reports/${reportId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: nextOrganizationId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się przypisać zgłoszenia");
      }

      toast.success(`Zgłoszenie przypisane do ${result.report.organization.name}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd przypisania");
    } finally {
      setIsSaving(false);
    }
  }

  if (!canAssign) {
    return (
      <span className="tag">{organizationName ?? "Nieprzypisane"}</span>
    );
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {organizationId ? (
        <span className="tag">{organizationName}</span>
      ) : (
        <span className="pill new">Nieprzypisane</span>
      )}

      <select
        className="select"
        defaultValue=""
        disabled={isSaving}
        aria-label="Przypisz zgłoszenie do organizacji"
        onChange={(event) => {
          const value = event.target.value;
          event.target.value = "";
          if (value) void assign(value);
        }}
      >
        <option value="">
          {organizationId ? "Zmień jednostkę…" : "Przypisz do…"}
        </option>
        {organizations
          .filter((organization) => organization.id !== organizationId)
          .map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
      </select>
    </div>
  );
}
