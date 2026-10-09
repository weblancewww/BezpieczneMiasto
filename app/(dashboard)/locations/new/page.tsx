"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { LocationPickerMap } from "@/components/map/location-picker-map";

export default function NewLocationPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCoordinates, setSelectedCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    description: "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          latitude: selectedCoordinates?.latitude,
          longitude: selectedCoordinates?.longitude,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się utworzyć lokalizacji");
      }

      toast.success("Lokalizacja została utworzona");
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
        </div>
      </section>

      <div className="card">
        <div className="card-head">
          <h2>Nowa lokalizacja</h2>
          <span className="hint">Token QR zostanie wygenerowany automatycznie</span>
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
                  placeholder="np. Droga Powiatowa 1486K"
                  required
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
                  placeholder="ulica, miejscowość"
                  required
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
                />
              </div>
              <div className="field full">
                <label>Wybór punktu na mapie</label>
                <LocationPickerMap value={selectedCoordinates} onChange={setSelectedCoordinates} />
              </div>
              <div className="field">
                <label htmlFor="latitude">Szerokość geograficzna</label>
                <input
                  id="latitude"
                  className="input num"
                  value={selectedCoordinates ? selectedCoordinates.latitude.toFixed(6) : ""}
                  readOnly
                  placeholder="Kliknij na mapie"
                />
              </div>
              <div className="field">
                <label htmlFor="longitude">Długość geograficzna</label>
                <input
                  id="longitude"
                  className="input num"
                  value={selectedCoordinates ? selectedCoordinates.longitude.toFixed(6) : ""}
                  readOnly
                  placeholder="Kliknij na mapie"
                />
              </div>
            </div>

            <div className="inline justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving || !selectedCoordinates}
              >
                <Check size={17} />
                {isSaving ? "Zapisywanie…" : "Utwórz lokalizację"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
