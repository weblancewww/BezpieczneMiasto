"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APIProvider, Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { Check, Pencil, Trash2, Upload } from "lucide-react";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawGoogleMapsAdapter } from "terra-draw-google-maps-adapter";
import { boundaryFromGeoJson, countVertices, simplifyBoundary, type Boundary } from "@/lib/geo";

type TerraFeature = {
  geometry: { type: string; coordinates: unknown } | null;
};

type DrawMode = "polygon" | "select";

const DEFAULT_CENTER = { lat: 49.656, lng: 21.16 };

/* Powyżej tego progu nie rysujemy punktów-wierzchołków — Terra Draw tworzy dla
   każdego osobny znacznik, co przy granicy z OSM (setki punktów) zamula mapę. */
const MAX_COORDINATE_POINTS = 200;

/* Powyżej tylu wierzchołków wklejony GeoJSON upraszczamy przed zapisem. */
const SIMPLIFY_ABOVE_VERTICES = 1000;
const PASTE_TOLERANCE_METERS = 10;

const POLYGON_STYLE = {
  fillColor: "#c8f04a",
  fillOpacity: 0.22,
  outlineColor: "#c8f04a",
  outlineWidth: 2,
  closingPointColor: "#c8f04a",
  closingPointWidth: 6,
  closingPointOutlineColor: "#20240f",
  closingPointOutlineWidth: 2,
  coordinatePointColor: "#c8f04a",
  coordinatePointWidth: 6,
  coordinatePointOutlineColor: "#20240f",
  coordinatePointOutlineWidth: 2,
} as const;

/** Scala wszystkie wielokąty w jedną granicę MultiPolygon. */
function toBoundary(features: TerraFeature[]): Boundary | null {
  const polygons: unknown[] = [];

  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      polygons.push(geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates as unknown[]) {
        polygons.push(polygon);
      }
    }
  }

  if (!polygons.length) return null;

  return { type: "MultiPolygon", coordinates: polygons } as Boundary;
}

function serialize(boundary: Boundary | null): string {
  return boundary ? JSON.stringify(boundary) : "";
}

/** Zbiera wszystkie wierzchołki granicy — do licznika i dopasowania widoku. */
function collectPoints(boundary: Boundary): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];

  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;

    if (typeof node[0] === "number" && typeof node[1] === "number") {
      points.push({ lat: node[1], lng: node[0] });
      return;
    }

    node.forEach(walk);
  };

  walk(boundary.coordinates);
  return points;
}

function fitToBoundary(
  map: google.maps.Map | null,
  boundary: Boundary | null
) {
  if (!map || !boundary || !window.google?.maps) return;

  const points = collectPoints(boundary);
  if (!points.length) return;

  const bounds = new window.google.maps.LatLngBounds();
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 48);
}

type DrawToolsProps = {
  value: Boundary | null;
  mode: DrawMode | null;
  onChange: (boundary: Boundary | null) => void;
  onStats: (vertexCount: number) => void;
  vertexCount: number;
};

/**
 * Warstwa rysowania. MUSI być dzieckiem <GoogleMap>, bo tylko wtedy `useMap()`
 * zwraca instancję mapy — a bez niej Terra Draw nie ma się do czego podpiąć.
 */
function DrawTools({ value, mode, onChange, onStats, vertexCount }: DrawToolsProps) {
  const map = useMap();
  const drawRef = useRef<TerraDraw | null>(null);
  const loadedRef = useRef<string>("");
  const onChangeRef = useRef(onChange);
  const onStatsRef = useRef(onStats);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  /* Liczy wierzchołki rysunku. W store Terra Draw obok wielokąta siedzą też
     osobne cechy `Point` (punkty wierzchołków z `showCoordinatePoints`),
     dlatego bierzemy wyłącznie geometrie Polygon/MultiPolygon. */
  const syncStats = useCallback(() => {
    const features = (drawRef.current?.getSnapshot() ?? []) as unknown as TerraFeature[];
    const polygons = features
      .filter(
        (feature) =>
          feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon"
      )
      .map((feature) => feature.geometry?.coordinates ?? []);

    onStatsRef.current(
      collectPoints({ type: "MultiPolygon", coordinates: polygons } as Boundary).length
    );
  }, []);

  const loadBoundary = useCallback(
    (boundary: Boundary | null) => {
      const draw = drawRef.current;
      if (!draw) return;

      loadedRef.current = serialize(boundary);
      draw.clear();

      if (boundary) {
        const polygons =
          boundary.type === "Polygon"
            ? [boundary.coordinates]
            : (boundary.coordinates as unknown[]);

        /* Terra Draw wymaga: unikalnego `id` oraz `properties.mode` —
           bez tego cecha jest odrzucana przez walidację. */
        draw.addFeatures(
          polygons.map((polygon) => ({
            id: crypto.randomUUID(),
            type: "Feature",
            properties: { mode: "polygon" },
            geometry: { type: "Polygon", coordinates: polygon },
          })) as never
        );
      }

      syncStats();
    },
    [syncStats]
  );

  /* Start Terra Draw — dopiero gdy mapa istnieje i wyrenderowała swoje panele.
     Adapter Terra Draw szuka węzła `div[style*="z-index: 3;"]` (overlayMouseTarget)
     i wiesza na nim nasłuch zdarzeń. Ten węzeł powstaje dopiero po pierwszej
     klatce renderu mapy — jeśli wystartujemy wcześniej, `addEventListener`
     dostaje null i cały edytor się wysypuje. Dlatego czekamy na panele. */
  useEffect(() => {
    if (!map || drawRef.current) return;

    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;

    const start = () => {
      if (cancelled || drawRef.current) return;

      const lib = window.google?.maps;
      const container = map.getDiv();
      const panes = container?.querySelector('div[style*="z-index: 3;"]');

      if (!lib || !panes) {
        // ~10 s zapasu; po tym czasie odpuszczamy, żeby nie zapętlić się na zawsze.
        if (attempts++ < 160) {
          timer = window.setTimeout(start, 60);
        }
        return;
      }

      const draw = new TerraDraw({
        adapter: new TerraDrawGoogleMapsAdapter({ lib, map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: POLYGON_STYLE,
            // Decydujemy od razu na podstawie wczytanej granicy, żeby nie
            // renderować setek znaczników choćby na jedną klatkę.
            showCoordinatePoints:
              (valueRef.current ? countVertices(valueRef.current) : 0) <=
              MAX_COORDINATE_POINTS,
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });

      draw.start();
      drawRef.current = draw;

      /* Wypuszcza aktualny rysunek na zewnątrz.
         KLUCZOWE: najpierw zapisujemy własną wersję do `loadedRef`, dopiero
         potem wołamy `onChange`. Bez tego rodzic zapisywał nową granicę
         w stanie, wracała ona jako prop `value`, a efekt synchronizacji
         uznawał ją za zmianę z zewnątrz i przeładowywał rysunek
         (`draw.clear()`), przerywając każdy ruch przeciągania. */
      const emit = () => {
        const features = draw.getSnapshot() as unknown as TerraFeature[];
        const boundary = toBoundary(features);

        loadedRef.current = serialize(boundary);
        onChangeRef.current(boundary);
        syncStats();
      };

      const handleChange = (_ids: unknown, type: string) => {
        /* Podczas przeciągania wierzchołka leci seria zdarzeń "update"
           (kilkadziesiąt na sekundę). Nie ma sensu przerenderowywać nimi
           formularza — licznik odświeżamy, a wynik wyślemy po "finish". */
        if (type === "update") {
          syncStats();
          return;
        }

        emit();
      };

      draw.on("change", handleChange);
      draw.on("finish", emit);

      // Teraz, gdy warstwa istnieje, wczytaj aktualną granicę.
      loadedRef.current = "";
      loadBoundary(valueRef.current);
      fitToBoundary(map, valueRef.current);
    };

    start();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);

      const draw = drawRef.current;
      if (!draw) return;

      draw.stop();
      drawRef.current = null;
      loadedRef.current = "";
    };
  }, [map, loadBoundary, syncStats]);

  /* Reakcja na zmianę granicy spoza edytora (wybór organizacji, import GeoJSON) */
  useEffect(() => {
    if (!drawRef.current) return;
    if (serialize(value) === loadedRef.current) return;

    loadBoundary(value);
    fitToBoundary(map, value);
  }, [value, map, loadBoundary]);

  /* Zmiana trybu rysowania */
  useEffect(() => {
    if (!drawRef.current || !mode) return;
    drawRef.current.setMode(mode);
  }, [mode, map]);

  /* Punkty-wierzchołki rysunku. Terra Draw tworzy dla każdego z nich osobny
     znacznik, więc przy granicy importowanej z OSM (setki wierzchołków)
     włączanie ich zamula mapę. Pokazujemy je tylko dla granic rysowanych
     ręcznie — tam są potrzebne, a jest ich kilka.

     Tak samo punkty środkowe w trybie zaznaczania: przy 500-wierzchołkowej
     granicy to kilkaset dodatkowych znaczników, a dodawanie wierzchołków do
     gotowej granicy z Geoportalu i tak nie ma sensu. */
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;

    const detailed = vertexCount <= MAX_COORDINATE_POINTS;

    draw.updateModeOptions("polygon", { showCoordinatePoints: detailed });

    draw.updateModeOptions("select", {
      flags: {
        polygon: {
          feature: {
            draggable: true,
            coordinates: {
              midpoints: detailed,
              draggable: true,
              deletable: true,
            },
          },
        },
      },
    });
  }, [vertexCount, map]);

  return null;
}

type EditorProps = {
  value: Boundary | null;
  onChange: (boundary: Boundary | null) => void;
  /** Wysokość mapy w px. */
  height?: number;
};

function BoundaryEditorInner({ value, onChange, height = 320 }: EditorProps) {
  const [mode, setMode] = useState<DrawMode | null>(null);
  const [vertexCount, setVertexCount] = useState(0);
  const [geoJsonOpen, setGeoJsonOpen] = useState(false);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [geoJsonError, setGeoJsonError] = useState("");
  const [geoJsonNotice, setGeoJsonNotice] = useState("");

  const handleStats = useCallback((count: number) => setVertexCount(count), []);

  function importGeoJson() {
    const parsed = boundaryFromGeoJson(geoJsonText);

    if ("error" in parsed) {
      setGeoJsonError(parsed.error);
      return;
    }

    setGeoJsonError("");
    setGeoJsonOpen(false);
    setGeoJsonText("");

    /* GeoJSON z Geoportalu ma często tysiące wierzchołków. Przycinamy go od
       razu, żeby nie zapisać do bazy granicy, która zamuli mapę. */
    const vertices = countVertices(parsed);

    if (vertices > SIMPLIFY_ABOVE_VERTICES) {
      const simplified = simplifyBoundary(parsed, PASTE_TOLERANCE_METERS);
      const reduced = countVertices(simplified);

      setGeoJsonNotice(
        `Granica uproszczona z ${vertices} do ${reduced} punktów ` +
          `(tolerancja ${PASTE_TOLERANCE_METERS} m) — kształt pozostaje bez zmian wizualnych.`
      );
      onChange(simplified);
      return;
    }

    setGeoJsonNotice("");
    onChange(parsed);
  }

  return (
    <div className="boundary-editor">
      <div className="boundary-toolbar">
        <button
          type="button"
          className={`btn btn-sm ${mode === "polygon" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setMode("polygon")}
        >
          <Pencil size={15} />
          Rysuj granicę
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mode === "select" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setMode("select")}
        >
          <Check size={15} />
          Popraw punkty
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => setGeoJsonOpen((open) => !open)}
        >
          <Upload size={15} />
          Wklej GeoJSON
        </button>
        <span className="spacer" />
        <span className="hintline num">{vertexCount} pkt</span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setMode(null);
            onChange(null);
          }}
        >
          <Trash2 size={15} />
          Wyczyść
        </button>
      </div>

      {geoJsonOpen ? (
        <div className="boundary-geojson">
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            placeholder="Wklej GeoJSON granicy (Polygon, MultiPolygon, Feature lub FeatureCollection)…"
            value={geoJsonText}
            onChange={(event) => setGeoJsonText(event.target.value)}
          />
          {geoJsonError ? (
            <span className="err" style={{ display: "block" }}>
              {geoJsonError}
            </span>
          ) : null}
          {geoJsonNotice ? (
            <span className="hintline" style={{ display: "block" }}>
              {geoJsonNotice}
            </span>
          ) : null}
          <div className="inline justify-end">
            <button type="button" className="btn btn-sm btn-primary" onClick={importGeoJson}>
              Wczytaj granicę
            </button>
          </div>
        </div>
      ) : null}

      <GoogleMap
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={11}
        mapId="boundary-editor-map"
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        style={{ width: "100%", height }}
      >
        <DrawTools
          value={value}
          mode={mode}
          vertexCount={vertexCount}
          onChange={onChange}
          onStats={handleStats}
        />
      </GoogleMap>

      <p className="hintline">
        {mode === "polygon"
          ? "Klikaj kolejne wierzchołki, a na końcu kliknij pierwszy punkt (albo dwuklik), aby zamknąć obszar."
          : mode === "select"
            ? "Przeciągaj wierzchołki, aby dopracować granicę. Kliknij punkt środkowy, aby dodać nowy wierzchołek."
            : "Narysuj granicę gminy lub powiatu albo wklej gotowy GeoJSON (np. z Geoportalu)."}
      </p>
    </div>
  );
}

export function BoundaryEditorMap({ value, onChange, height = 320 }: EditorProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="photo-empty">
        <span>
          Brak klucza Google Maps. Ustaw NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, aby rysować granice.
        </span>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <BoundaryEditorInner value={value} onChange={onChange} height={height} />
    </APIProvider>
  );
}
