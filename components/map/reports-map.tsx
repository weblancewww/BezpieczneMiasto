"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider, AdvancedMarker, InfoWindow, Map as GoogleMap, Pin } from "@vis.gl/react-google-maps";
import { cn, reportStatusClass, reportStatusLabel, type ReportStatus } from "@/lib/utils";
import { MapReportDialog } from "./map-report-dialog";

type MarkerPoint = {
  id: string;
  status: ReportStatus;
  locationName: string;
  latitude: number;
  longitude: number;
};

type Props = {
  markers: MarkerPoint[];
};

type MarkerGroup = {
  key: string;
  locationName: string;
  latitude: number;
  longitude: number;
  reports: MarkerPoint[];
  dominantStatus: ReportStatus;
};

const statusColor: Record<MarkerPoint["status"], string> = {
  NEW: "#ef4444",
  ANALYSIS: "#f59e0b",
  IN_PROGRESS: "#3b82f6",
  RESOLVED: "#10b981",
};

const statusDotClass: Record<MarkerPoint["status"], string> = {
  NEW: "bg-rose-500",
  ANALYSIS: "bg-amber-500",
  IN_PROGRESS: "bg-sky-500",
  RESOLVED: "bg-emerald-500",
};

const statusPriority: Record<ReportStatus, number> = {
  NEW: 4,
  ANALYSIS: 3,
  IN_PROGRESS: 2,
  RESOLVED: 1,
};

export function ReportsMap({ markers }: Props) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const markerClickedRef = useRef(false);
  const [enabledStatuses, setEnabledStatuses] = useState<Record<MarkerPoint["status"], boolean>>({
    NEW: true,
    ANALYSIS: true,
    IN_PROGRESS: true,
    RESOLVED: true,
  });
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(null);

  const visibleMarkers = useMemo(
    () => markers.filter((marker) => enabledStatuses[marker.status]),
    [enabledStatuses, markers]
  );

  const statusCounts = useMemo(() => {
    return markers.reduce(
      (acc, marker) => {
        acc[marker.status] += 1;
        return acc;
      },
      { NEW: 0, ANALYSIS: 0, IN_PROGRESS: 0, RESOLVED: 0 } as Record<MarkerPoint["status"], number>
    );
  }, [markers]);

  const groupedMarkers = useMemo<MarkerGroup[]>(() => {
    const groups = new Map<string, MarkerGroup>();

    visibleMarkers.forEach((marker) => {
      const lat = Number(marker.latitude.toFixed(6));
      const lng = Number(marker.longitude.toFixed(6));
      const key = `${lat}:${lng}:${marker.locationName}`;
      const existing = groups.get(key);

      if (existing) {
        existing.reports.push(marker);

        if (statusPriority[marker.status] > statusPriority[existing.dominantStatus]) {
          existing.dominantStatus = marker.status;
        }

        return;
      }

      groups.set(key, {
        key,
        locationName: marker.locationName,
        latitude: lat,
        longitude: lng,
        reports: [marker],
        dominantStatus: marker.status,
      });
    });

    return Array.from(groups.values());
  }, [visibleMarkers]);

  const selectedGroup = useMemo(
    () => groupedMarkers.find((group) => group.key === selectedGroupKey) || null,
    [groupedMarkers, selectedGroupKey]
  );

  if (!apiKey) {
    return (
      <div className="bg-card border border-border rounded-lg h-96 flex items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby włączyć mapę.
        </p>
      </div>
    );
  }

  const centerSource = groupedMarkers.length > 0 ? groupedMarkers : markers;
  const center =
    centerSource.length > 0
      ? { lat: centerSource[0].latitude, lng: centerSource[0].longitude }
      : { lat: 52.069, lng: 19.48 }; // default: center of Poland
  const defaultZoom = centerSource.length > 0 ? 12 : 6;

  const statusOrder: MarkerPoint["status"][] = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {statusOrder.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() =>
              setEnabledStatuses((current) => ({
                ...current,
                [status]: !current[status],
              }))
            }
            className={`cursor-pointer rounded-full border px-[15px] py-[9px] text-xs font-medium transition ${
              enabledStatuses[status]
                ? "border-border bg-card text-foreground"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  statusDotClass[status],
                  enabledStatuses[status] ? "opacity-100" : "opacity-55"
                )}
              />
              <span>{reportStatusLabel[status]} ({statusCounts[status]})</span>
            </span>
          </button>
        ))}
      </div>
      <div className="h-96 overflow-hidden">
      <APIProvider apiKey={apiKey}>
        <GoogleMap
          defaultCenter={center}
          defaultZoom={defaultZoom}
          mapId="reports-map"
          onClick={(event) => {
            if (markerClickedRef.current) return;
            const latLng = event.detail?.latLng;
            if (!latLng) return;
            setSelectedGroupKey(null);
            setClickedPoint({ lat: latLng.lat, lng: latLng.lng });
          }}
        >
          {groupedMarkers.map((group) => (
            <AdvancedMarker
              key={group.key}
              position={{ lat: group.latitude, lng: group.longitude }}
              title={
                group.reports.length > 1
                  ? `${group.locationName} · ${group.reports.length} zgłoszeń`
                  : `${group.locationName} · #${group.reports[0].id.substring(0, 8).toUpperCase()}`
              }
              clickable
              onClick={() => {
                markerClickedRef.current = true;
                setSelectedGroupKey(group.key);
                setTimeout(() => { markerClickedRef.current = false; }, 100);
              }}
            >
              <Pin
                background={statusColor[group.dominantStatus]}
                borderColor="#0f172a"
                glyphColor="#ffffff"
                glyph={group.reports.length > 1 ? String(group.reports.length) : undefined}
              />
            </AdvancedMarker>
          ))}
          {selectedGroup ? (
            <InfoWindow
              position={{ lat: selectedGroup.latitude, lng: selectedGroup.longitude }}
              onCloseClick={() => setSelectedGroupKey(null)}
              headerContent={selectedGroup.locationName}
            >
              <div className="min-w-56 space-y-2 p-1 text-sm">
                {selectedGroup.reports.length === 1 ? (
                  <>
                    <p className="text-muted-foreground">
                      ID zgłoszenia: #{selectedGroup.reports[0].id.substring(0, 8).toUpperCase()}
                    </p>
                    <div className={cn(reportStatusClass(selectedGroup.reports[0].status), "w-fit")}>{reportStatusLabel[selectedGroup.reports[0].status]}</div>
                    <a
                      href={`/reports/${selectedGroup.reports[0].id}`}
                      className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Przejdź do zgłoszenia
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">Liczba zgłoszeń w punkcie: {selectedGroup.reports.length}</p>
                    <div className="max-h-48 space-y-2 overflow-auto pr-1">
                      {selectedGroup.reports.map((report) => (
                        <div key={report.id} className="rounded-md border border-border bg-card px-2 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground">#{report.id.substring(0, 8).toUpperCase()}</span>
                            <span className={cn(reportStatusClass(report.status), "text-[10px]")}>{reportStatusLabel[report.status]}</span>
                          </div>
                          <a
                            href={`/reports/${report.id}`}
                            className="mt-2 inline-flex items-center text-xs font-semibold text-primary hover:underline"
                          >
                            Otwórz zgłoszenie
                          </a>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </InfoWindow>
          ) : null}
        </GoogleMap>
        <MapReportDialog
          open={clickedPoint !== null}
          lat={clickedPoint?.lat ?? null}
          lng={clickedPoint?.lng ?? null}
          onClose={() => setClickedPoint(null)}
          onReportCreated={() => {
            setClickedPoint(null);
            router.refresh();
          }}
        />
      </APIProvider>
      </div>
      <p className="text-sm text-muted-foreground">
        Kliknij pinezkę, aby zobaczyć zgłoszenie. Kliknij w dowolne miejsce na mapie, aby dodać nowe zgłoszenie.
      </p>
    </div>
  );
}