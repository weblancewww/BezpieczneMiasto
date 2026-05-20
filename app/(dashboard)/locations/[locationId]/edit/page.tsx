"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
        if (!active) {
          return;
        }

        const message = error instanceof Error ? error.message : "Błąd ładowania";
        toast.error(message);
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
      const message = error instanceof Error ? error.message : "Błąd zapisu";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Edycja lokalizacji</h1>
        <Link href="/locations">
          <Button variant="outline">Wróć do listy</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edytuj dane lokalizacji</CardTitle>
          <CardDescription>
            {isLoading
              ? "Ładowanie lokalizacji..."
              : `Token QR: ${location?.qrToken.substring(0, 12)}...`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nazwa</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Adres</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(event) => setFormData((current) => ({ ...current, address: event.target.value }))}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Opis miejsca (opcjonalnie)"
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="latitude">Szerokość geograficzna</Label>
                <Input
                  id="latitude"
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
              <div className="grid gap-2">
                <Label htmlFor="longitude">Długość geograficzna</Label>
                <Input
                  id="longitude"
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

            <div className="flex gap-2">
              <a href={`/api/locations/${locationId}/qr`} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline" disabled={isLoading}>
                  Otwórz kod QR
                </Button>
              </a>
              {location ? (
                <a href={`/r/${location.qrToken}`} target="_blank" rel="noreferrer">
                  <Button type="button" variant="outline" disabled={isLoading}>
                    Otwórz link z QR
                  </Button>
                </a>
              ) : null}
              <Button type="submit" disabled={isSaving || isLoading}>
                {isSaving ? "Zapisywanie..." : "Zapisz zmiany"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}