"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) closeAndReset(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Dodaj zgłoszenie z mapy</DialogTitle>
        </DialogHeader>

        {/* Location info */}
        <div className="rounded-md border border-border bg-muted/60 p-3 text-sm space-y-1">
          {isGeocoding ? (
            <p className="text-muted-foreground">Pobieranie adresu…</p>
          ) : address ? (
            <>
              <p className="font-medium text-foreground">{address}</p>
              {matchedOrgName && (
                <p className="text-muted-foreground text-xs">
                  Organizacja:{" "}
                  <span className="font-semibold text-foreground">{matchedOrgName}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Współrzędne: {lat?.toFixed(6)}, {lng?.toFixed(6)}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mr-name">Imię i nazwisko</Label>
              <Input
                id="mr-name"
                value={formData.reporterName}
                onChange={(e) =>
                  setFormData((c) => ({ ...c, reporterName: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-phone">Telefon</Label>
              <Input
                id="mr-phone"
                type="tel"
                value={formData.reporterPhone}
                onChange={(e) =>
                  setFormData((c) => ({ ...c, reporterPhone: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mr-email">Email</Label>
            <Input
              id="mr-email"
              type="email"
              value={formData.reporterEmail}
              onChange={(e) =>
                setFormData((c) => ({ ...c, reporterEmail: e.target.value }))
              }
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mr-desc">Opis problemu</Label>
            <Textarea
              id="mr-desc"
              rows={3}
              value={formData.description}
              onChange={(e) =>
                setFormData((c) => ({ ...c, description: e.target.value }))
              }
              placeholder="Opisz problem…"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mr-photos">Zdjęcia (opcjonalnie)</Label>
            <Input
              id="mr-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []))}
            />
          </div>

          {photoPreviewUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoPreviewUrls.map((url, i) => (
                <div key={url} className="rounded-md border border-border overflow-hidden">
                  <Image
                    src={url}
                    alt={`Podgląd ${i + 1}`}
                    width={160}
                    height={112}
                    unoptimized
                    className="h-24 w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={closeAndReset}
            >
              Anuluj
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "Wysyłanie…" : "Dodaj zgłoszenie"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
