"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, ExternalLink, Pencil, Plus, QrCode, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type LocationRow = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  latitude: number;
  longitude: number;
  qrToken: string;
  createdAt: string;
  organization: { name: string };
  _count: { reports: number };
};

function LocationsContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";

  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [qrLocation, setQrLocation] = useState<LocationRow | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch("/api/locations", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać lokalizacji");
        }

        const data = (await response.json()) as LocationRow[];

        if (active) {
          setLocations(data);
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

    if (!lowered) {
      return locations;
    }

    return locations.filter(
      (location) =>
        location.name.toLowerCase().includes(lowered) ||
        location.address.toLowerCase().includes(lowered) ||
        location.organization.name.toLowerCase().includes(lowered) ||
        location.qrToken.toLowerCase().includes(lowered)
    );
  }, [locations, query]);

  async function deleteLocation(locationId: string) {
    if (!window.confirm("Czy na pewno usunąć lokalizację?")) {
      return;
    }

    try {
      setDeletingId(locationId);
      const response = await fetch(`/api/locations/${locationId}`, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się usunąć lokalizacji");
      }

      setLocations((current) => current.filter((location) => location.id !== locationId));
      toast.success("Lokalizacja została usunięta");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd usuwania");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section>
        <div className="toolbar">
          <span className="hintline num">{filtered.length} punktów zgłoszeń</span>
          <div className="spacer" />
          <Link className="btn btn-primary" href="/locations/new">
            <Plus size={17} />
            Nowa lokalizacja
          </Link>
        </div>
      </section>

      <section className="card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div className="empty">
            <p>Ładowanie lokalizacji…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <QrCode />
            <p>Brak lokalizacji spełniających kryteria.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Lokalizacja</th>
                <th>Adres i jednostka</th>
                <th>Współrzędne</th>
                <th style={{ textAlign: "right" }}>Zgł.</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((location) => (
                <tr key={location.id} onClick={() => setQrLocation(location)}>
                  <td>
                    <div className="t-main">{location.name}</div>
                    <div className="t-sub">{location.description || "Zgłoszenia ogólne"}</div>
                  </td>
                  <td>
                    <div className="t-sub" style={{ fontSize: 13 }}>
                      {location.address}
                      <div style={{ marginTop: 3 }}>{location.organization.name}</div>
                    </div>
                  </td>
                  <td className="num-col" style={{ textAlign: "left", fontSize: 12.5 }}>
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </td>
                  <td className="num-col">{location._count.reports}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Kod QR"
                        aria-label={`Kod QR: ${location.name}`}
                        onClick={() => setQrLocation(location)}
                      >
                        <QrCode />
                      </button>
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={`/locations/${location.id}/edit`}
                        title="Edytuj"
                        aria-label={`Edytuj: ${location.name}`}
                      >
                        <Pencil />
                      </Link>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Usuń"
                        aria-label={`Usuń: ${location.name}`}
                        disabled={deletingId === location.id}
                        onClick={() => deleteLocation(location.id)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className={`modal${qrLocation ? " open" : ""}`} role="dialog" aria-modal="true">
        {qrLocation ? (
          <>
            <div className="scrim" onClick={() => setQrLocation(null)} aria-hidden="true" />
            <div className="modal-card">
              <div className="modal-head">
                <div>
                  <h2>Kod QR lokalizacji</h2>
                  <p>{qrLocation.name}</p>
                </div>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Zamknij"
                  onClick={() => setQrLocation(null)}
                >
                  <X />
                </button>
              </div>
              <div
                className="modal-body stack"
                style={{ alignItems: "center", textAlign: "center", gap: 16 }}
              >
                <div
                  style={{
                    padding: 18,
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid var(--hairline)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/locations/${qrLocation.id}/qr`}
                    alt={`Kod QR dla ${qrLocation.name}`}
                    width={220}
                    height={220}
                    style={{ width: 220, height: 220 }}
                  />
                </div>
                <p className="hintline" style={{ maxWidth: "38ch" }}>
                  Obywatel skanuje kod przy punkcie i trafia na formularz zgłoszenia przypisany do
                  tej lokalizacji.
                  <br />
                  <span className="mono">{qrLocation.qrToken}</span>
                </p>
                <div className="inline">
                  <a
                    className="btn btn-secondary"
                    href={`/api/locations/${qrLocation.id}/qr`}
                    download
                  >
                    <Download size={17} />
                    Pobierz PNG
                  </a>
                  <a className="btn btn-ghost" href={`/r/${qrLocation.qrToken}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={17} />
                    Otwórz link
                  </a>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export default function LocationsPage() {
  return (
    <Suspense
      fallback={
        <div className="empty">
          <p>Ładowanie lokalizacji…</p>
        </div>
      }
    >
      <LocationsContent />
    </Suspense>
  );
}
