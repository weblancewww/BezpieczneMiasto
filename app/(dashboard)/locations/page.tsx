"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  organization: {
    name: string;
  };
  _count: {
    reports: number;
  };
};

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const response = await fetch("/api/locations", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Nie udało się pobrać lokalizacji");
        }

        const data = (await response.json()) as LocationRow[];

        if (!active) {
          return;
        }

        setLocations(data);
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
  }, []);

  async function refresh() {
    try {
      setIsLoading(true);
      const response = await fetch("/api/locations", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Nie udało się pobrać lokalizacji");
      }

      const data = (await response.json()) as LocationRow[];
      setLocations(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd odświeżania";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteLocation(locationId: string) {
    if (!window.confirm("Czy na pewno usunąć lokalizację?")) {
      return;
    }

    try {
      setDeletingId(locationId);
      const response = await fetch(`/api/locations/${locationId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Nie udało się usunąć lokalizacji");
      }

      setLocations((current) => current.filter((location) => location.id !== locationId));
      toast.success("Lokalizacja została usunięta");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd usuwania";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  }

  const filteredLocations = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    if (!lowered) {
      return locations;
    }

    return locations.filter((location) =>
      location.name.toLowerCase().includes(lowered) ||
      location.address.toLowerCase().includes(lowered) ||
      location.organization.name.toLowerCase().includes(lowered) ||
      location.qrToken.toLowerCase().includes(lowered)
    );
  }, [locations, query]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-foreground">Lokalizacje</h1>
        <div className="flex gap-2">
          <Button onClick={refresh} variant="outline" disabled={isLoading}>
            Odśwież
          </Button>
          <Link href="/locations/new">
            <Button>+ Nowa lokalizacja</Button>
          </Link>
        </div>
      </div>

      <Card className="neo-card">
        <CardHeader className="space-y-4">
          <CardTitle className="text-foreground">Lista lokalizacji</CardTitle>
          <Input
            placeholder="Szukaj po nazwie, adresie, organizacji lub tokenie QR"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Ładowanie lokalizacji...</p>
          ) : filteredLocations.length === 0 ? (
            <p className="text-muted-foreground">Brak lokalizacji spełniających kryteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Adres</TableHead>
                  <TableHead>Organizacja</TableHead>
                  <TableHead>Współrzędne</TableHead>
                  <TableHead>Zgłoszenia</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead>Akcja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-medium">{location.name}</TableCell>
                    <TableCell>{location.address}</TableCell>
                    <TableCell>{location.organization.name}</TableCell>
                    <TableCell>
                      {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                    </TableCell>
                    <TableCell>{location._count.reports}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <code className="text-xs text-muted-foreground">{location.qrToken.substring(0, 12)}...</code>
                        <a
                          href={`/api/locations/${location.id}/qr`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Otwórz QR
                        </a>
                        <a
                          href={`/r/${location.qrToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Otwórz link z QR
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Link href={`/locations/${location.id}/edit`}>
                          <Button variant="outline">Edytuj</Button>
                        </Link>
                        <Button
                          variant="destructive"
                          onClick={() => deleteLocation(location.id)}
                          disabled={deletingId === location.id}
                        >
                          {deletingId === location.id ? "Usuwanie..." : "Usuń"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
