"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, QrCode } from "lucide-react";
import { toast } from "sonner";

type LocationDetails = {
  id: string;
  name: string;
  address: string;
  description: string | null;
  latitude: number;
  longitude: number;
  qrToken: string;
};

export default function EditLocationPage() {
  const params = useParams();
  const router = useRouter();
  const locationId = params.locationId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [location, setLocation] = useState<LocationDetails | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    description: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch(`/api/locations/${locationId}`, { cache: "no-store" });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Nie udało się pobrać lokalizacji");
        }

        if (!active) {
          return;
        }

        setLocation(result);
        setFormData({
          name: result.name,
          address: result.address,
          description: result.description || "",
          latitude: String(result.latitude),
          longitude: String(result.longitude),
        });
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
  }, [locationId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          latitude: Number(formData.latitude),
          longitude: Number(formData.longitude),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się zapisać lokalizacji");
      }

      toast.success("Lokalizacja została zaktualizowana");
      router.push("/locations");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd zapisu");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section>
        <div className="toolbar">
          <Link className="btn btn-secondary btn-sm" href="/locations">
            <ArrowLeft size={15} />
            Wróć do listy
          </Link>
          <div className="spacer" />
          {location ? (
            <>
              <a
                className="btn btn-ghost btn-sm"
                href={`/api/locations/${locationId}/qr`}
                target="_blank"
                rel="noreferrer"
              >
                <QrCode size={15} />
                Kod QR
              </a>
              <a
                className="btn btn-ghost btn-sm"
                href={`/r/${location.qrToken}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                Link z QR
              </a>
            </>
          ) : null}
        </div>
      </section>

      <div className="card">
        <div className="card-head">
          <h2>Edycja lokalizacji</h2>
          <span className="hint">
            {isLoading ? "Ładowanie…" : `Token QR: ${location?.qrToken.substring(0, 12)}…`}
          </span>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit} className="stack">
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Nazwa</label>
                <input
                  id="name"
                  className="input"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="field full">
                <label htmlFor="address">Adres</label>
                <input
                  id="address"
                  className="input"
                  value={formData.address}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, address: event.target.value }))
                  }
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="field full">
                <label htmlFor="description">Opis</label>
                <textarea
                  id="description"
                  className="textarea"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Opis miejsca (opcjonalnie)"
                  disabled={isLoading}
                />
              </div>
              <div className="field">
                <label htmlFor="latitude">Szerokość geograficzna</label>
                <input
                  id="latitude"
                  className="input num"
                  type="number"
                  step="0.000001"
                  value={formData.latitude}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, latitude: event.target.value }))
                  }
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="field">
                <label htmlFor="longitude">Długość geograficzna</label>
                <input
                  id="longitude"
                  className="input num"
                  type="number"
                  step="0.000001"
                  value={formData.longitude}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, longitude: event.target.value }))
                  }
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="inline justify-end">
              <button type="submit" className="btn btn-primary" disabled={isSaving || isLoading}>
                <Check size={17} />
                {isSaving ? "Zapisywanie…" : "Zapisz zmiany"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
