"use client";

import { APIProvider, AdvancedMarker, Map, Pin, type MapMouseEvent } from "@vis.gl/react-google-maps";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  value: Coordinates | null;
  onChange: (coords: Coordinates) => void;
};

const defaultCenter = {
  lat: 49.655,
  lng: 20.159,
};

export function LocationPickerMap({ value, onChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="bg-slate-100 rounded h-80 flex items-center justify-center px-6 text-center">
        <p className="text-slate-600">
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby wybierać punkt na mapie.
        </p>
      </div>
    );
  }

  function handleMapClick(event: MapMouseEvent) {
    const latLng = event.detail.latLng;

    if (!latLng) {
      return;
    }

    onChange({ latitude: latLng.lat, longitude: latLng.lng });
  }

  const markerPosition = value
    ? {
        lat: value.latitude,
        lng: value.longitude,
      }
    : null;

  const initialCenter = markerPosition ?? defaultCenter;

  return (
    <div className="space-y-3">
      <div className="rounded overflow-hidden h-80 border border-slate-200">
        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={initialCenter}
            defaultZoom={11}
            mapId="location-picker-map"
            gestureHandling="greedy"
            onClick={handleMapClick}
          >
            {markerPosition ? (
              <AdvancedMarker position={markerPosition} title="Wybrana lokalizacja">
                <Pin background="#0f766e" borderColor="#0f172a" glyphColor="#ffffff" />
              </AdvancedMarker>
            ) : null}
          </Map>
        </APIProvider>
      </div>
      <p className="text-xs text-slate-600">Kliknij na mapie, aby ustawić lokalizację.</p>
    </div>
  );
}
