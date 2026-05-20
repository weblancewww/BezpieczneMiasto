"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function QRReportPage() {
  const params = useParams();
  const qrToken = params.qrToken as string;

  const [isLoading, setIsLoading] = useState(false);
  const [isLocationLoading, setIsLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [locationName, setLocationName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [reportNumber, setReportNumber] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    reporterName: "",
    email: "",
    phone: "",
    description: "",
  });

  useEffect(() => {
    let active = true;

    async function loadLocation() {
      try {
        setIsLocationLoading(true);
        const response = await fetch(`/api/locations/qr/${qrToken}`);

        if (!response.ok) {
          throw new Error("Nie udało się pobrać lokalizacji");
        }

        const location = await response.json();

        if (!active) {
          return;
        }

        setLocationName(location.name);
        setOrganizationName(location.organization?.name || "");
      } catch {
        if (!active) {
          return;
        }

        setLocationError("Nie rozpoznano kodu QR lub lokalizacja jest niedostępna.");
      } finally {
        if (active) {
          setIsLocationLoading(false);
        }
      }
    }

    loadLocation();

    return () => {
      active = false;
    };
  }, [qrToken]);

  const photoPreviewUrls = useMemo(
    () => photoFiles.map((file) => URL.createObjectURL(file)),
    [photoFiles]
  );

  useEffect(() => {
    return () => {
      photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviewUrls]);

  const selectedPhotosLabel = useMemo(() => {
    if (photoFiles.length === 0) {
      return "Brak wybranych zdjęć";
    }

    return photoFiles.length === 1
      ? photoFiles[0].name
      : `${photoFiles.length} wybrane pliki`;
  }, [photoFiles]);

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoFiles(Array.from(e.target.files || []));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = new FormData();
      payload.append("qrToken", qrToken);
      payload.append("reporterName", formData.reporterName);
      payload.append("reporterEmail", formData.email);
      payload.append("reporterPhone", formData.phone);
      payload.append("description", formData.description);

      photoFiles.forEach((file) => {
        payload.append("photos", file);
      });

      const response = await fetch("/api/reports", {
        method: "POST",
        body: payload,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się wysłać zgłoszenia");
      }

      setReportNumber(result.reportNumber);
      setSubmitted(true);
      toast.success(`Zgłoszenie #${result.reportNumber} zostało przyjęte!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd podczas wysyłania zgłoszenia";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLocationLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="py-10 text-center text-slate-600">
            Wczytywanie lokalizacji...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (locationError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>Nie można otworzyć zgłoszenia</CardTitle>
            <CardDescription>{locationError}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="text-center space-y-4 py-10">
            <div className="text-4xl">✓</div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Dziękujemy!</h3>
              <p className="text-slate-600">
                Twoje zgłoszenie #{reportNumber} zostało przyjęte. Otrzymasz e-mail potwierdzający.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Zgłoś kolejną sprawę
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle>Zgłoś problem</CardTitle>
          <CardDescription>
            {locationName}
            {organizationName ? ` · ${organizationName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Imię i nazwisko</Label>
                <Input
                  id="name"
                  value={formData.reporterName}
                  onChange={(e) =>
                    setFormData({ ...formData, reporterName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
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
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Opis problemu</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
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
                onChange={handleFilesChange}
              />
              <p className="text-xs text-slate-500">{selectedPhotosLabel}</p>
            </div>

            {photoPreviewUrls.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Podgląd zdjęć</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {photoPreviewUrls.map((url, index) => (
                    <div key={url} className="rounded-lg border bg-white overflow-hidden">
                      <Image
                        src={url}
                        alt={`Podgląd zdjęcia ${index + 1}`}
                        width={320}
                        height={224}
                        unoptimized
                        className="h-28 w-full object-cover"
                      />
                      <p className="px-2 py-1 text-[11px] text-slate-600 truncate" title={photoFiles[index]?.name}>
                        {photoFiles[index]?.name || `Zdjęcie ${index + 1}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p><strong>Lokalizacja:</strong> {locationName}</p>
              <p><strong>Organizacja:</strong> {organizationName || "-"}</p>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? "Wysyłanie..." : "Prześlij zgłoszenie"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
