"use client";

import { APIProvider, AdvancedMarker, Map, type MapMouseEvent } from "@vis.gl/react-google-maps";

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
  lng: 21.16,
};

export function LocationPickerMap({ value, onChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="photo-empty">
        <span>
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby wybierać punkt na
          mapie.
        </span>
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

  const markerPosition = value ? { lat: value.latitude, lng: value.longitude } : null;
  const initialCenter = markerPosition ?? defaultCenter;

  return (
    <div className="map-picker">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={initialCenter}
          defaultZoom={11}
          mapId="location-picker-map"
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          onClick={handleMapClick}
        >
          {markerPosition ? (
            <AdvancedMarker position={markerPosition} title="Wybrana lokalizacja">
              <span className="pin-dot accent" />
            </AdvancedMarker>
          ) : null}
        </Map>
      </APIProvider>
      <span className="picker-hint">
        {value
          ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
          : "Kliknij mapę, aby ustawić punkt"}
      </span>
    </div>
  );
}
