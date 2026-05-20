"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { APIProvider, useMapsLibrary, Map as GoogleMap, AdvancedMarker } from "@vis.gl/react-google-maps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type GeoResult = {
  requestLat: number;
  requestLng: number;
  address: string;
  areas: string[];
} | null;

function LocationReportForm() {
  const geocodingLib = useMapsLibrary("geocoding");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoResult, setGeoResult] = useState<GeoResult>(null);
  const [locationError, setLocationError] = useState("");
  const [isLocating, setIsLocating] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [reportNumber, setReportNumber] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    reporterName: "",
    email: "",
    phone: "",
    description: "",
  });

  const resultMatchesCurrent =
    coords !== null &&
    geoResult !== null &&
    geoResult.requestLat === coords.lat &&
    geoResult.requestLng === coords.lng;

  const isGeocoding = coords !== null && geocodingLib !== null && !resultMatchesCurrent;
  const address = resultMatchesCurrent ? geoResult.address : "";
  const geocodedAreas = useMemo(
    () => (resultMatchesCurrent ? geoResult!.areas : []),
    [resultMatchesCurrent, geoResult]
  );

  const photoPreviewUrls = useMemo(
    () => photoFiles.map((file) => URL.createObjectURL(file)),
    [photoFiles]
  );

  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviewUrls]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Twoja przeglądarka nie wspiera geolokalizacji.");
      setIsLocating(false);
      return;
    }

    setLocationError("");
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCoords(nextCoords);
        setGeoResult(null);
        setIsLocating(false);
      },
      (error) => {
        setCoords(null);
        setIsLocating(false);

        if (error.code === error.PERMISSION_DENIED) {
          setLocationError("Brak zgody na lokalizację. Zezwól i spróbuj ponownie.");
          return;
        }

        setLocationError("Nie udało się pobrać Twojej lokalizacji.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }, []);

  // Auto-load location on page entry without synchronous setState in effect body.
  useEffect(() => {
    queueMicrotask(() => {
      requestLocation();
    });
  }, [requestLocation]);

  useEffect(() => {
    if (!coords || !geocodingLib) return;

    const geocoder = new geocodingLib.Geocoder();
    let cancelled = false;

    geocoder.geocode({ location: coords }, (results, status) => {
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
          requestLat: coords.lat,
          requestLng: coords.lng,
          address: result.formatted_address ?? "",
          areas,
        });
      } else {
        setGeoResult({ requestLat: coords.lat, requestLng: coords.lng, address: "", areas: [] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [coords, geocodingLib]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!coords) {
      toast.error("Najpierw pobierz lokalizację.");
      return;
    }

    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("lat", String(coords.lat));
      payload.append("lng", String(coords.lng));
      payload.append("address", address);
      payload.append("geocodedAreas", JSON.stringify(geocodedAreas));
      payload.append("reporterName", formData.reporterName);
      payload.append("reporterEmail", formData.email);
      payload.append("reporterPhone", formData.phone);
      payload.append("description", formData.description);
      photoFiles.forEach((file) => payload.append("photos", file));

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
        throw new Error(result.error || "Nie udało się wysłać zgłoszenia");
      }

      setReportNumber(result.reportNumber || "");
      setOrganizationName(result.organizationName || "");
      setSubmitted(true);
      toast.success(`Zgłoszenie #${result.reportNumber} zostało przyjęte!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd podczas wysyłania zgłoszenia";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="text-center space-y-4 py-10">
          <div className="text-4xl">✓</div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Dziękujemy!</h3>
            <p className="text-muted-foreground">
              Twoje zgłoszenie #{reportNumber} zostało przyjęte.
            </p>
            <p className="text-muted-foreground">
              Przypisana organizacja: {organizationName || "-"}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Zgłoś kolejną sprawę
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl shadow-lg">
      <CardHeader>
        <CardTitle>Zgłoś problem z mojej lokalizacji</CardTitle>
        <CardDescription>
          Lokalizacja zostanie użyta do przypisania zgłoszenia do organizacji po gminie/powiecie.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-2">
            {isLocating ? <p>Ustalanie Twojej lokalizacji...</p> : null}
            {!isLocating && locationError ? <p>{locationError}</p> : null}
            {coords ? (
              <>
                <div className="mb-2 rounded-lg overflow-hidden border border-border bg-card">
                  <div style={{ width: "100%", height: 220, position: "relative" }}>
                    <GoogleMap
                      center={coords}
                      zoom={16}
                      mapId="report-location-map"
                      gestureHandling="none"
                      disableDefaultUI={true}
                      clickableIcons={false}
                      draggable={false}
                      zoomControl={false}
                      scrollwheel={false}
                      disableDoubleClickZoom={true}
                      keyboardShortcuts={false}
                      mapTypeControl={false}
                      streetViewControl={false}
                      fullscreenControl={false}
                      minZoom={16}
                      maxZoom={16}
                      restriction={{ latLngBounds: { north: coords.lat + 0.01, south: coords.lat - 0.01, east: coords.lng + 0.01, west: coords.lng - 0.01 }, strictBounds: true }}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <AdvancedMarker position={coords} />
                    </GoogleMap>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  <strong>To nie to miejsce?</strong> Kliknij poniżej, aby zmienić lokalizację.
                </div>
                <Button type="button" variant="outline" onClick={requestLocation}>
                  Zmień lokalizację
                </Button>
                <div className="mt-2">
                  <p>
                    Współrzędne: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  </p>
                  <p>{isGeocoding ? "Pobieranie adresu..." : address || "Adres niedostępny"}</p>
                  {geocodedAreas.length > 0 ? (
                    <p>Wykryte obszary: {geocodedAreas.join(", ")}</p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Imię i nazwisko</Label>
              <Input
                id="name"
                value={formData.reporterName}
                onChange={(e) => setFormData((current) => ({ ...current, reporterName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((current) => ({ ...current, phone: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Opis problemu</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((current) => ({ ...current, description: e.target.value }))}
              placeholder="Opisz dokładnie jaki problem zaobserwowałeś..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="photos">Zdjęcia</Label>
            <Input
              id="photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
            />
          </div>

          {photoPreviewUrls.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Podgląd zdjęć</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photoPreviewUrls.map((url, index) => (
                  <div key={url} className="rounded-lg border bg-card overflow-hidden">
                    <Image
                      src={url}
                      alt={`Podgląd zdjęcia ${index + 1}`}
                      width={320}
                      height={224}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                    <p className="px-2 py-1 text-[11px] text-muted-foreground truncate" title={photoFiles[index]?.name}>
                      {photoFiles[index]?.name || `Zdjęcie ${index + 1}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button type="submit" disabled={isLoading || !coords} className="w-full">
            {isLoading ? "Wysyłanie..." : "Prześlij zgłoszenie"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ReportFromLocationPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Brak konfiguracji map</CardTitle>
            <CardDescription>
              Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby uruchomić zgłoszenia z geolokalizacji.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <APIProvider apiKey={apiKey}>
        <LocationReportForm />
      </APIProvider>
    </div>
  );
}
