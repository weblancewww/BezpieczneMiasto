"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
      const message = error instanceof Error ? error.message : "Błąd zapisu";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Nowa lokalizacja</h1>
        <Link href="/locations">
          <Button variant="outline">Wróć do listy</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dodaj lokalizację</CardTitle>
          <CardDescription>
            Po zapisaniu lokalizacji system wygeneruje unikalny token QR dla miejsca.
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
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Adres</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(event) => setFormData((current) => ({ ...current, address: event.target.value }))}
                required
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
              />
            </div>

            <div className="grid gap-2">
              <Label>Wybór punktu na mapie</Label>
              <LocationPickerMap value={selectedCoordinates} onChange={setSelectedCoordinates} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="latitude">Szerokość geograficzna (z mapy)</Label>
                <Input
                  id="latitude"
                  value={
                    selectedCoordinates ? selectedCoordinates.latitude.toFixed(6) : ""
                  }
                  readOnly
                  placeholder="Kliknij na mapie"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="longitude">Długość geograficzna (z mapy)</Label>
                <Input
                  id="longitude"
                  value={
                    selectedCoordinates ? selectedCoordinates.longitude.toFixed(6) : ""
                  }
                  readOnly
                  placeholder="Kliknij na mapie"
                />
              </div>
            </div>

            <Button type="submit" disabled={isSaving || !selectedCoordinates}>
              {isSaving ? "Zapisywanie..." : "Utwórz lokalizację"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
