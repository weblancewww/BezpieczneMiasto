"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { X } from "lucide-react";
import { toast } from "sonner";

type OrganizationItem = {
  id: string;
  name: string;
  type: string;
  adminArea: string | null;
};

type Props = {
  open: boolean;
  lat: number | null;
  lng: number | null;
  onClose: () => void;
  onReportCreated: () => void;
};

function normalizeStr(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Stores the geocoding result along with the request coords so we can
// detect stale results without synchronous setState calls in effects.
type GeoResult = {
  requestLat: number;
  requestLng: number;
  address: string;
  areas: string[];
} | null;

export function MapReportDialog({ open, lat, lng, onClose, onReportCreated }: Props) {
  const geocodingLib = useMapsLibrary("geocoding");

  // All geocoding state lives in one object; only updated in async callbacks.
  const [geoResult, setGeoResult] = useState<GeoResult>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    reporterName: "",
    reporterEmail: "",
    reporterPhone: "",
    description: "",
  });

  // Derive loading / address / areas from result – avoids synchronous setState in effects.
  const resultMatchesCurrent =
    geoResult !== null && geoResult.requestLat === lat && geoResult.requestLng === lng;

  const isGeocoding =
    open && lat !== null && lng !== null && geocodingLib !== null && !resultMatchesCurrent;

  const address = resultMatchesCurrent ? geoResult.address : "";
  const geocodedAreas = useMemo(
    () => (resultMatchesCurrent ? geoResult!.areas : []),
    [resultMatchesCurrent, geoResult]
  );

  const photoPreviewUrls = useMemo(
    () => photoFiles.map((f) => URL.createObjectURL(f)),
    [photoFiles]
  );

  useEffect(
    () => () => {
      photoPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
    },
    [photoPreviewUrls]
  );

  // Reverse-geocode whenever the dialog opens with new coordinates.
  // Only calls setState inside the async Geocoder callback – never synchronously.
  useEffect(() => {
    if (!open || !geocodingLib || lat === null || lng === null) return;

    const geocoder = new geocodingLib.Geocoder();
    let cancelled = false;

    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (cancelled) return;

      if (status === "OK" && results && results.length > 0) {
        const result = results[0];
        const areas = result.address_components
          .filter(
            (c) =>
              c.types.includes("administrative_area_level_2") ||
              c.types.includes("administrative_area_level_3") ||
              c.types.includes("locality") ||
              c.types.includes("sublocality")
          )
          .map((c) => c.long_name);

        setGeoResult({
          requestLat: lat,
          requestLng: lng,
          address: result.formatted_address ?? "",
          areas,
        });
      } else {
        setGeoResult({ requestLat: lat, requestLng: lng, address: "", areas: [] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, geocodingLib, lat, lng]);

  // Fetch organizations once on mount (used to preview matched org client-side).
  useEffect(() => {
    let cancelled = false;

    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data: OrganizationItem[]) => {
        if (!cancelled) setOrganizations(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive matched org name via useMemo (no extra effect needed).
  const matchedOrgName = useMemo<string | null>(() => {
    if (geocodedAreas.length === 0 || organizations.length === 0) return null;

    const normAreas = geocodedAreas.map(normalizeStr);

    function matches(org: OrganizationItem): boolean {
      if (!org.adminArea) return false;
      const orgAreas = org.adminArea.split(",").map(normalizeStr);
      return normAreas.some((ga) =>
        orgAreas.some((oa) => oa.includes(ga) || ga.includes(oa))
      );
    }

    const gmina = organizations.find((o) => o.type === "GMINA" && matches(o));
    const powiat = organizations.find((o) => o.type === "POWIAT" && matches(o));
    return gmina?.name ?? powiat?.name ?? null;
  }, [geocodedAreas, organizations]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lat === null || lng === null) return;
    setIsSubmitting(true);

    try {
      const payload = new FormData();
      payload.append("lat", String(lat));
      payload.append("lng", String(lng));
      payload.append("address", address);
      payload.append("geocodedAreas", JSON.stringify(geocodedAreas));
      payload.append("reporterName", formData.reporterName);
      payload.append("reporterEmail", formData.reporterEmail);
      payload.append("reporterPhone", formData.reporterPhone);
      payload.append("description", formData.description);
      photoFiles.forEach((f) => payload.append("photos", f));

      const response = await fetch("/api/reports/from-map", {
        method: "POST",
        body: payload,
      });
      const result = (await response.json()) as {
        error?: string;
        reportNumber?: string;
        organizationName?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Błąd wysyłania zgłoszenia");
      }

      toast.success(
        `Zgłoszenie #${result.reportNumber} przyjęte` +
          (result.organizationName ? ` → ${result.organizationName}` : "")
      );
      onReportCreated();
      closeAndReset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Błąd wysyłania");
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeAndReset() {
    setFormData({ reporterName: "", reporterEmail: "", reporterPhone: "", description: "" });
    setPhotoFiles([]);
    setGeoResult(null);
    onClose();
  }

  // Dialog jest otwierany wyłącznie w reakcji na klik użytkownika, więc portalu
  // nie trzeba renderować na serwerze.
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="modal open"
      role="dialog"
      aria-modal="true"
      aria-label="Dodaj zgłoszenie z mapy"
    >
      <div className="scrim" onClick={closeAndReset} aria-hidden="true" />
      <div className="modal-card">
            <div className="modal-head">
              <div>
                <h2>Dodaj zgłoszenie z mapy</h2>
                <p>Zgłoszenie trafi automatycznie do właściwej jednostki.</p>
              </div>
              <button type="button" className="iconbtn" aria-label="Zamknij" onClick={closeAndReset}>
                <X size={19} />
              </button>
            </div>

            <div className="modal-body stack" style={{ gap: 16 }}>
              <div
                style={{
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-2)",
                  padding: "14px 16px",
                  fontSize: 13.5,
                }}
              >
                {isGeocoding ? (
                  <span className="hintline">Pobieranie adresu…</span>
                ) : address ? (
                  <>
                    <div style={{ fontWeight: 600 }}>{address}</div>
                    {matchedOrgName ? (
                      <div className="hintline" style={{ marginTop: 4 }}>
                        Organizacja:{" "}
                        <strong style={{ color: "var(--accent)" }}>{matchedOrgName}</strong>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <span className="hintline num">
                    Współrzędne: {lat?.toFixed(6)}, {lng?.toFixed(6)}
                  </span>
                )}
              </div>

              <form onSubmit={handleSubmit} className="stack" style={{ gap: 16 }}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="mr-name">Imię i nazwisko</label>
                    <input
                      id="mr-name"
                      className="input"
                      value={formData.reporterName}
                      onChange={(e) => setFormData((c) => ({ ...c, reporterName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mr-phone">Telefon</label>
                    <input
                      id="mr-phone"
                      className="input"
                      type="tel"
                      value={formData.reporterPhone}
                      onChange={(e) => setFormData((c) => ({ ...c, reporterPhone: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="mr-email">E-mail</label>
                    <input
                      id="mr-email"
                      className="input"
                      type="email"
                      value={formData.reporterEmail}
                      onChange={(e) => setFormData((c) => ({ ...c, reporterEmail: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="mr-desc">Opis problemu</label>
                    <textarea
                      id="mr-desc"
                      className="textarea"
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData((c) => ({ ...c, description: e.target.value }))}
                      placeholder="Opisz problem…"
                      required
                    />
                  </div>
                  <div className="field full">
                    <label htmlFor="mr-photos">Zdjęcia (opcjonalnie)</label>
                    <input
                      id="mr-photos"
                      className="input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
                    />
                  </div>
                </div>

                {photoPreviewUrls.length > 0 && (
                  <div className="thumbs">
                    {photoPreviewUrls.map((url, i) => (
                      <div key={url} className="thumb">
                        <Image
                          src={url}
                          alt={`Podgląd ${i + 1}`}
                          width={160}
                          height={160}
                          unoptimized
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="inline justify-end">
                  <button type="button" className="btn btn-secondary" onClick={closeAndReset}>
                    Anuluj
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? "Wysyłanie…" : "Dodaj zgłoszenie"}
                  </button>
                </div>
              </form>
            </div>
          </div>
      </div>,
    document.body
  );
}
