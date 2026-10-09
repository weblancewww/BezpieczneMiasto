"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider, AdvancedMarker, Map as GoogleMap } from "@vis.gl/react-google-maps";
import { X } from "lucide-react";
import { MapReportDialog } from "./map-report-dialog";
import type { ReportStatus } from "@/lib/utils";

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

const STATUS_ORDER: ReportStatus[] = ["NEW", "ANALYSIS", "IN_PROGRESS", "RESOLVED"];

const STATUS_META: Record<ReportStatus, { label: string; cls: string }> = {
  NEW: { label: "Nowe", cls: "new" },
  ANALYSIS: { label: "Podjęte do analizy", cls: "analysis" },
  IN_PROGRESS: { label: "W trakcie rozwiązywania", cls: "progress" },
  RESOLVED: { label: "Rozwiązane", cls: "resolved" },
};

const STATUS_PRIORITY: Record<ReportStatus, number> = {
  NEW: 4,
  ANALYSIS: 3,
  IN_PROGRESS: 2,
  RESOLVED: 1,
};

function shortCode(id: string) {
  return `#${id.substring(0, 8).toUpperCase()}`;
}

export function ReportsMap({ markers }: Props) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const markerClickedRef = useRef(false);

  const [enabledStatuses, setEnabledStatuses] = useState<Record<ReportStatus, boolean>>({
    NEW: true,
    ANALYSIS: true,
    IN_PROGRESS: true,
    RESOLVED: true,
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(null);

  const statusCounts = useMemo(
    () =>
      markers.reduce(
        (acc, marker) => {
          acc[marker.status] += 1;
          return acc;
        },
        { NEW: 0, ANALYSIS: 0, IN_PROGRESS: 0, RESOLVED: 0 } as Record<ReportStatus, number>
      ),
    [markers]
  );

  const groups = useMemo<MarkerGroup[]>(() => {
    const map = new Map<string, MarkerGroup>();

    markers
      .filter((marker) => enabledStatuses[marker.status])
      .forEach((marker) => {
        const lat = Number(marker.latitude.toFixed(6));
        const lng = Number(marker.longitude.toFixed(6));
        const key = `${lat}:${lng}:${marker.locationName}`;
        const existing = map.get(key);

        if (existing) {
          existing.reports.push(marker);
          if (STATUS_PRIORITY[marker.status] > STATUS_PRIORITY[existing.dominantStatus]) {
            existing.dominantStatus = marker.status;
          }
          return;
        }

        map.set(key, {
          key,
          locationName: marker.locationName,
          latitude: lat,
          longitude: lng,
          reports: [marker],
          dominantStatus: marker.status,
        });
      });

    return Array.from(map.values());
  }, [markers, enabledStatuses]);

  const selected = useMemo(
    () => groups.find((group) => group.key === selectedKey) ?? null,
    [groups, selectedKey]
  );

  if (!apiKey) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <p className="hintline" style={{ maxWidth: "34ch" }}>
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby włączyć mapę.
        </p>
      </div>
    );
  }

  const centerSource = groups.length > 0 ? groups : markers;
  const center =
    centerSource.length > 0
      ? { lat: centerSource[0].latitude, lng: centerSource[0].longitude }
      : { lat: 49.656, lng: 21.16 };
  const zoom = centerSource.length > 0 ? 11 : 6;

  return (
    <APIProvider apiKey={apiKey}>
      <div className="reports-map">
        <div className="reports-map-canvas">
          <GoogleMap
            defaultCenter={center}
            defaultZoom={zoom}
            mapId="reports-map"
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            onClick={(event) => {
              if (markerClickedRef.current) return;
              const latLng = event.detail?.latLng;
              if (!latLng) return;
              setSelectedKey(null);
              setClickedPoint({ lat: latLng.lat, lng: latLng.lng });
            }}
          >
            {groups.map((group) => (
              <AdvancedMarker
                key={group.key}
                position={{ lat: group.latitude, lng: group.longitude }}
                title={
                  group.reports.length > 1
                    ? `${group.locationName} · ${group.reports.length} zgłoszeń`
                    : `${group.locationName} · ${shortCode(group.reports[0].id)}`
                }
                onClick={() => {
                  markerClickedRef.current = true;
                  setSelectedKey(group.key);
                  setTimeout(() => {
                    markerClickedRef.current = false;
                  }, 120);
                }}
              >
                <span className={`pin-dot ${STATUS_META[group.dominantStatus].cls}`}>
                  {group.reports.length > 1 ? group.reports.length : ""}
                </span>
              </AdvancedMarker>
            ))}
          </GoogleMap>
        </div>

        <div className="map-legend" role="group" aria-label="Filtry statusów">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className="lg"
              style={{ opacity: enabledStatuses[status] ? 1 : 0.45, background: "none", padding: 0 }}
              aria-pressed={enabledStatuses[status]}
              onClick={() =>
                setEnabledStatuses((current) => ({ ...current, [status]: !current[status] }))
              }
            >
              <i style={{ background: `var(--${STATUS_META[status].cls})` }} />
              {STATUS_META[status].label} ({statusCounts[status]})
            </button>
          ))}
        </div>

        <div className="map-attrib">Kliknij w mapę, aby dodać zgłoszenie</div>

        {selected ? (
          <div className="map-callout">
            <button
              type="button"
              className="iconbtn map-callout-close"
              aria-label="Zamknij"
              onClick={() => setSelectedKey(null)}
            >
              <X size={15} />
            </button>
            <div className="mc-place">{selected.locationName}</div>
            <div className="mc-meta">
              {selected.reports.length === 1
                ? `${shortCode(selected.reports[0].id)} · ${STATUS_META[selected.reports[0].status].label}`
                : `${selected.reports.length} zgłoszeń w tym punkcie`}
            </div>
            <div className="mc-list">
              {selected.reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className="mc-item"
                  onClick={() => router.push(`/reports/${report.id}`)}
                >
                  <span className="mono">{shortCode(report.id)}</span>
                  <span className={`pill ${STATUS_META[report.status].cls}`}>
                    {STATUS_META[report.status].label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

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
      </div>
    </APIProvider>
  );
}
