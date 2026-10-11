/**
 * Statyczne obrazki map do maili.
 *
 * W mailu nie ma jak osadzić interaktywnej mapy Google, więc pobieramy gotowy
 * PNG z Static Maps API i wysyłamy go jako załącznik inline (CID). Dzięki temu
 * obrazek działa także wtedy, gdy aplikacja stoi na `localhost` albo w sieci
 * wewnętrznej — nie potrzebujemy publicznego adresu do hostowania grafiki.
 *
 * Klucz: bierzemy `GOOGLE_MAPS_STATIC_API_KEY`, a gdy go nie ma, ten sam klucz
 * co mapa w panelu. Static Maps to osobne API — jeśli nie jest włączone
 * w projekcie Google Cloud, funkcja po prostu zwróci `null` i mail pójdzie
 * bez mapy (nie blokujemy wysyłki).
 */
import { createHash } from "crypto";

const ENDPOINT = "https://maps.googleapis.com/maps/api/staticmap";

/** Szerokość w pikselach logicznych; `scale: 2` daje obraz 2× gęstszy (retina). */
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 300;

/** Poziom przybliżenia: 17 pokazuje nazwy ulic i obrysy budynków. */
const DEFAULT_ZOOM = 17;

/** Limit czasu na pobranie obrazka — mail nie może czekać w nieskończoność. */
const REQUEST_TIMEOUT_MS = 6000;

/** Cache: zmiana statusu tego samego zgłoszenia używa tej samej mapy. */
const CACHE_LIMIT = 40;
const cache = new Map<string, StaticMapImage>();

export type StaticMapImage = {
  content: Buffer;
  contentType: string;
  cid: string;
  width: number;
  height: number;
};

/**
 * Ciemne barwienie mapy zgodne z paletą panelu. Static Maps używa jeszcze
 * składni „legacy" (element/feature), bo nowszy JSON stylów nie jest tu wspierany.
 */
const DARK_STYLES = [
  "element:geometry|color:0x12100D",
  "element:labels.text.fill|color:0xADABA3",
  "element:labels.text.stroke|color:0x060604",
  "feature:road|element:geometry|color:0x2F2E29",
  "feature:road|element:geometry.stroke|color:0x1E1D18",
  "feature:road.highway|element:geometry|color:0x3A3628",
  "feature:road.highway|element:geometry.stroke|color:0x1E1D18",
  "feature:road.local|element:labels.text.fill|color:0x8A8880",
  "feature:water|element:geometry|color:0x0B1A22",
  "feature:water|element:labels.text.fill|color:0x5A6E78",
  "feature:poi|element:geometry|color:0x1A1815",
  "feature:poi.park|element:geometry|color:0x15200F",
  "feature:landscape|element:geometry|color:0x151310",
  "feature:administrative|element:geometry|color:0x2F2E29",
];

/** Znacznik w kolorze akcentu z ciemną obwódką — czytelny na ciemnej mapie. */
const MARKER_COLOR = "0xEBEA97";

function apiKey(): string {
  return (
    process.env.GOOGLE_MAPS_STATIC_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    ""
  );
}

export function isStaticMapConfigured(): boolean {
  return Boolean(apiKey());
}

export type StaticMapRequest = {
  latitude: number;
  longitude: number;
  zoom?: number;
  width?: number;
  height?: number;
  /** Opis miejsca — trafia do `alt` obrazka w mailu. */
  label?: string;
};

/**
 * Pobiera obrazek mapy dla punktu. Zwraca `null`, gdy:
 * brakuje klucza, współrzędne są niepoprawne, Google zwrócił błąd,
 * odpowiedź nie jest obrazem albo przekroczono limit czasu.
 */
export async function renderStaticMap(
  request: StaticMapRequest
): Promise<StaticMapImage | null> {
  const key = apiKey();
  if (!key) return null;

  const { latitude, longitude } = request;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const zoom = request.zoom ?? DEFAULT_ZOOM;
  const width = request.width ?? DEFAULT_WIDTH;
  const height = request.height ?? DEFAULT_HEIGHT;

  // Zaokrąglenie do 5 miejsc (~1 m) — drobne różnice nie tworzą nowych obrazków.
  const cacheKey = [
    latitude.toFixed(5),
    longitude.toFixed(5),
    zoom,
    width,
    height,
  ].join("|");

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = new URL(ENDPOINT);
  url.searchParams.set("center", `${latitude},${longitude}`);
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("size", `${width}x${height}`);
  url.searchParams.set("scale", "2");
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("key", key);
  url.searchParams.set("markers", `size:mid|color:${MARKER_COLOR}|${latitude},${longitude}`);

  for (const style of DARK_STYLES) {
    url.searchParams.append("style", style);
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(
        `[email] static map: Google zwrócił ${response.status} — mail pójdzie bez mapy`
      );
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    /* Przy błędzie Google potrafi odpowiedzieć kodem 200 i treścią tekstową
       (np. „The Google Maps Platform server rejected your request").
       Dlatego sprawdzamy typ, zamiast ufać samemu statusowi. */
    if (!contentType.startsWith("image/")) {
      const reason = (await response.text()).slice(0, 200);
      console.warn(
        `[email] static map: odpowiedź nie jest obrazem (${contentType}) — ${reason}`
      );
      return null;
    }

    const content = Buffer.from(await response.arrayBuffer());
    const cid = `${createHash("sha1").update(cacheKey).digest("hex").slice(0, 16)}@bezpiecznemiasto`;

    const image: StaticMapImage = { content, contentType, cid, width, height };

    // Prosty cache bez eksmisji LRU — przy 40 wpisach to nie ma znaczenia.
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(cacheKey, image);

    return image;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[email] static map: nie udało się pobrać mapy — ${reason}`);
    return null;
  }
}
