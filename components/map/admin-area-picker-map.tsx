"use client";

import { useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  type MapMouseEvent,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

type Coordinates = {
  lat: number;
  lng: number;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
};

type AreaType = "POWIAT" | "GMINA";

type SelectedArea = {
  key: string;
  name: string;
  type: AreaType;
};

const defaultCenter: Coordinates = {
  lat: 52.0,
  lng: 19.3,
};

function normalizeArea(parts: { powiat?: string; gmina?: string }, order: AreaType[]) {
  const byType = {
    GMINA: parts.gmina,
    POWIAT: parts.powiat,
  } as const;

  const areas = order
    .map((type) => byType[type])
    .filter((item): item is string => Boolean(item))
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.findIndex((a) => a.toLowerCase() === item.toLowerCase()) === index);

  return areas.join(", ");
}

function parseAdminArea(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({
      key: `name:${name.toLowerCase()}`,
      name,
      type: name.toLowerCase().includes("powiat") ? ("POWIAT" as const) : ("GMINA" as const),
    }));
}

function AdminAreaMapInner({ value, onChange }: Props) {
  const geocodingLib = useMapsLibrary("geocoding");
  const [coords, setCoords] = useState<Coordinates>(defaultCenter);
  const [isResolving, setIsResolving] = useState(false);
  const [hint, setHint] = useState<string>("Kliknij punkt na mapie, aby dodać gminę i/lub powiat.");
  const [enablePowiat, setEnablePowiat] = useState(true);
  const [enableGmina, setEnableGmina] = useState(true);
  const selectedAreas = useMemo(() => parseAdminArea(value), [value]);

  function emitAreas(next: SelectedArea[]) {
    const serialized = next.map((item) => item.name).join(", ");
    onChange(serialized);
  }

  function removeArea(key: string) {
    emitAreas(selectedAreas.filter((item) => item.key !== key));
  }

  async function handleMapClick(event: MapMouseEvent) {
    const latLng = event.detail.latLng;

    if (!latLng) {
      return;
    }

    const point = { lat: latLng.lat, lng: latLng.lng };
    setCoords(point);

    if (!geocodingLib) {
      setHint("Biblioteka geocoding jeszcze się ładuje. Spróbuj ponownie za chwilę.");
      return;
    }

    setIsResolving(true);

    const geocoder = new geocodingLib.Geocoder();

    geocoder.geocode({ location: point }, (results, status) => {
      setIsResolving(false);

      if (status !== "OK" || !results || results.length === 0) {
        setHint("Nie udało się rozpoznać gminy/powiatu dla tego punktu.");
        return;
      }

      const components = results[0].address_components;
      const powiat = components.find((c) => c.types.includes("administrative_area_level_2"))?.long_name;
      const gmina =
        components.find((c) => c.types.includes("administrative_area_level_3"))?.long_name ||
        components.find((c) => c.types.includes("locality"))?.long_name ||
        components.find((c) => c.types.includes("sublocality"))?.long_name;

      const ordered = [
        ...(enableGmina ? (["GMINA"] as AreaType[]) : []),
        ...(enablePowiat ? (["POWIAT"] as AreaType[]) : []),
      ];

      const area = normalizeArea({ gmina, powiat }, ordered);

      if (!area || ordered.length === 0) {
        setHint("Punkt został wybrany, ale nie znaleziono nazwy gminy/powiatu.");
        return;
      }

      const nextAreas: SelectedArea[] = [];
      if (enableGmina && gmina) {
        nextAreas.push({ key: `name:${gmina.toLowerCase()}`, name: gmina, type: "GMINA" });
      }
      if (enablePowiat && powiat) {
        nextAreas.push({ key: `name:${powiat.toLowerCase()}`, name: powiat, type: "POWIAT" });
      }

      const merged = [...selectedAreas];
      nextAreas.forEach((candidate) => {
        const exists = merged.some((item) => item.key === candidate.key);
        if (!exists) merged.push(candidate);
      });

      emitAreas(merged);
      setHint(`Wybrano: ${area}`);
    });
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="inline">
        <button
          type="button"
          onClick={() => setEnablePowiat((current) => !current)}
          className={`chip${enablePowiat ? " active" : ""}`}
        >
          Powiaty {enablePowiat ? "wł." : "wył."}
        </button>
        <button
          type="button"
          onClick={() => setEnableGmina((current) => !current)}
          className={`chip${enableGmina ? " active" : ""}`}
        >
          Gminy {enableGmina ? "wł." : "wył."}
        </button>
      </div>

      <div className="map-picker" style={{ minHeight: 240 }}>
        <GoogleMap
          defaultCenter={coords}
          defaultZoom={6}
          mapId="organization-admin-area-map"
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          onClick={handleMapClick}
        >
          <AdvancedMarker position={coords} title="Ostatnio wybrany punkt">
            <span className="pin-dot accent" />
          </AdvancedMarker>
        </GoogleMap>
      </div>

      {selectedAreas.length > 0 ? (
        <div className="inline">
          {selectedAreas.map((area) => (
            <button
              key={area.key}
              type="button"
              onClick={() => removeArea(area.key)}
              className={`tag ${area.type === "POWIAT" ? "type-POWIAT" : "type-GMINA"}`}
            >
              {area.type === "POWIAT" ? "Powiat" : "Gmina"}: {area.name} ×
            </button>
          ))}
        </div>
      ) : null}

      <p className="hintline">
        {isResolving ? "Pobieranie obszaru administracyjnego…" : hint}
      </p>
      <p className="hintline">
        Każde kliknięcie może dodać gminę, powiat albo oba typy jednocześnie. Kliknij chip poniżej
        mapy, aby usunąć wybrany obszar.
      </p>
    </div>
  );
}

export function AdminAreaPickerMap({ value, onChange }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="photo-empty">
        <span>
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby wybierać obszar na
          mapie.
        </span>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <AdminAreaMapInner value={value} onChange={onChange} />
    </APIProvider>
  );
}
