"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ReportWizard, type WizardLocation } from "@/components/public/report-wizard";

export default function QRReportPage() {
  const params = useParams();
  const qrToken = params.qrToken as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [location, setLocation] = useState<WizardLocation | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLocation() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/locations/qr/${qrToken}`);

        if (!response.ok) {
          throw new Error("Nie rozpoznano kodu QR lub lokalizacja jest niedostępna.");
        }

        const data = await response.json();

        if (!active) {
          return;
        }

        setLocation({
          name: data.name,
          organizationName: data.organization?.name ?? "",
          address: data.address ?? "",
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        });
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Nie rozpoznano kodu QR lub lokalizacja jest niedostępna."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadLocation();

    return () => {
      active = false;
    };
  }, [qrToken]);

  if (isLoading) {
    return (
      <div className="cm-public">
        <main className="stage" style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}>
          <p className="hintline">Wczytywanie lokalizacji…</p>
        </main>
      </div>
    );
  }

  if (error || !location) {
    return (
      <div className="cm-public">
        <main className="stage" style={{ display: "grid", placeItems: "center", minHeight: "60dvh" }}>
          <div className="card card-pad" style={{ textAlign: "center", maxWidth: 380 }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Nie można otworzyć zgłoszenia</h1>
            <p className="hintline" style={{ margin: 0 }}>
              {error || "Nie rozpoznano kodu QR lub lokalizacja jest niedostępna."}
            </p>
          </div>
        </main>
      </div>
    );
  }

  return <ReportWizard mode="qr" qrToken={qrToken} initialLocation={location} />;
}
