/**
 * Geometria do przypisywania zgłoszeń po granicach.
 *
 * Granice trzymamy jako GeoJSON (kolejność współrzędnych [lng, lat]) — w tej
 * samej postaci, w jakiej zwraca je Terra Draw i większość plików z Geoportalu.
 *
 * Test „punkt w wielokącie" robimy sami (ray casting) zamiast opierać się na
 * bibliotece geometrycznej Google, bo decyzję o przypisaniu musi podjąć serwer —
 * niezależnie od tego, czy klient w ogóle załadował Maps API.
 */

export type Position = [number, number];
export type LinearRing = Position[];
export type PolygonCoords = LinearRing[];
export type MultiPolygonCoords = PolygonCoords[];

export type Boundary = {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoords | MultiPolygonCoords;
};

export type OrganizationBoundary = {
  id: string;
  name: string;
  type: "POWIAT" | "GMINA";
  boundary: Boundary;
};

/** Czy punkt leży wewnątrz pierścienia (algorytm ray casting). */
function pointInRing(lng: number, lat: number, ring: LinearRing): boolean {
  if (ring.length < 3) return false;

  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    // Warunek `(yi > lat) !== (yj > lat)` gwarantuje, że yi !== yj,
    // więc dzielenie poniżej nigdy nie jest dzieleniem przez zero.
    const crossesParallel = yi > lat !== yj > lat;
    if (!crossesParallel) continue;

    const intersectLng = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (lng < intersectLng) inside = !inside;
  }

  return inside;
}

/** Czy punkt leży w wielokącie (pierścień zewnętrzny, z pominięciem dziur). */
function pointInPolygon(lng: number, lat: number, polygon: PolygonCoords): boolean {
  const [outer, ...holes] = polygon;
  if (!outer) return false;
  if (!pointInRing(lng, lat, outer)) return false;

  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

/** Czy punkt leży w granicy (Polygon lub MultiPolygon). */
export function containsPoint(boundary: Boundary, lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  if (boundary.type === "Polygon") {
    return pointInPolygon(lng, lat, boundary.coordinates as PolygonCoords);
  }

  return (boundary.coordinates as MultiPolygonCoords).some((polygon) =>
    pointInPolygon(lng, lat, polygon)
  );
}

/**
 * Przybliżone pole powierzchni w km² (odwzorowanie równoprostokątne).
 * Służy wyłącznie do porównywania granic między sobą — mniejsza granica
 * (gmina) wygrywa z większą (powiat), gdy obie zawierają ten sam punkt.
 */
export function approximateAreaKm2(boundary: Boundary): number {
  const polygons: PolygonCoords[] =
    boundary.type === "Polygon"
      ? [boundary.coordinates as PolygonCoords]
      : (boundary.coordinates as MultiPolygonCoords);

  let totalDegrees = 0;

  for (const polygon of polygons) {
    const [outer] = polygon;
    if (!outer || outer.length < 3) continue;

    let sum = 0;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      sum += outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1];
    }
    totalDegrees += Math.abs(sum / 2);
  }

  // 1° szerokości ≈ 111 km; długość skalujemy kosinusem średniej szerokości.
  const latitudes = polygons
    .flatMap((polygon) => polygon[0] ?? [])
    .map((position) => position[1]);
  const meanLat = latitudes.length
    ? latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length
    : 52;
  const latKm = 111;
  const lngKm = 111 * Math.cos((meanLat * Math.PI) / 180);

  return totalDegrees * latKm * Math.abs(lngKm);
}

/** Parsuje granicę z JSON-a trzymanego w bazie. Zwraca null, gdy dane są niepoprawne. */
export function parseBoundary(value: unknown): Boundary | null {
  if (!value) return null;

  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (typeof candidate !== "object" || candidate === null) return null;

  const record = candidate as { type?: unknown; coordinates?: unknown };
  if (record.type !== "Polygon" && record.type !== "MultiPolygon") return null;
  if (!Array.isArray(record.coordinates)) return null;

  const rings: PolygonCoords[] =
    record.type === "Polygon"
      ? [record.coordinates as PolygonCoords]
      : (record.coordinates as MultiPolygonCoords);

  if (!rings.length) return null;

  for (const polygon of rings) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;

    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 3) return null;

      for (const position of ring) {
        if (
          !Array.isArray(position) ||
          position.length < 2 ||
          !Number.isFinite(position[0]) ||
          !Number.isFinite(position[1])
        ) {
          return null;
        }
      }
    }
  }

  return {
    type: record.type,
    coordinates: record.type === "Polygon" ? rings[0] : rings,
  } as Boundary;
}

/**
 * Zamienia wklejony GeoJSON na granicę. Obsługuje:
 * geometrię (Polygon/MultiPolygon), Feature oraz FeatureCollection
 * (wszystkie wielokąty scalane w jedną MultiPolygon).
 */
export function boundaryFromGeoJson(input: string): Boundary | { error: string } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return { error: "To nie jest poprawny JSON." };
  }

  const polygons: PolygonCoords[] = [];

  const collect = (node: unknown): string | null => {
    if (typeof node !== "object" || node === null) return "Nieznana struktura GeoJSON.";

    const record = node as { type?: unknown; coordinates?: unknown; features?: unknown; geometry?: unknown };

    if (record.type === "FeatureCollection") {
      if (!Array.isArray(record.features)) return "FeatureCollection nie ma listy features.";
      for (const feature of record.features) {
        const error = collect(feature);
        if (error) return error;
      }
      return null;
    }

    if (record.type === "Feature") {
      if (!record.geometry) return null;
      return collect(record.geometry);
    }

    if (record.type === "Polygon") {
      const geometry = parseBoundary({ type: "Polygon", coordinates: record.coordinates });
      if (!geometry) return "Niepoprawne współrzędne wielokąta.";
      polygons.push(geometry.coordinates as PolygonCoords);
      return null;
    }

    if (record.type === "MultiPolygon") {
      const geometry = parseBoundary({ type: "MultiPolygon", coordinates: record.coordinates });
      if (!geometry) return "Niepoprawne współrzędne multiwielokąta.";
      polygons.push(...(geometry.coordinates as MultiPolygonCoords));
      return null;
    }

    return "Obsługiwane typy: Polygon, MultiPolygon, Feature, FeatureCollection.";
  };

  const error = collect(parsed);
  if (error) return { error };
  if (!polygons.length) return { error: "Nie znaleziono żadnego wielokąta w danych." };

  return { type: "MultiPolygon", coordinates: polygons };
}

/**
 * Wybiera organizację dla punktu.
 *
 * Kolejność decyzyjna:
 *  1. gmina zawierająca punkt (najmniejsza powierzchnia, jeśli jest kilka),
 *  2. powiat zawierający punkt (najmniejsza powierzchnia),
 *  3. null — punkt poza wszystkimi granicami (kolejka „Nieprzypisane").
 *
 * Świadomie NIE ma tu żadnego fallbacku typu „pierwsza organizacja z listy" —
 * to właśnie on sprawiał, że zgłoszenie z Krakowa lądowało w Gorlicach.
 */
export function findOrganizationForPoint(
  organizations: OrganizationBoundary[],
  lat: number,
  lng: number
): OrganizationBoundary | null {
  const containing = organizations.filter((organization) =>
    containsPoint(organization.boundary, lat, lng)
  );

  if (!containing.length) return null;

  const withArea = containing.map((organization) => ({
    organization,
    area: approximateAreaKm2(organization.boundary),
  }));

  const smallestFirst = [...withArea].sort((a, b) => a.area - b.area);

  const gmina = smallestFirst.find((entry) => entry.organization.type === "GMINA");
  if (gmina) return gmina.organization;

  const powiat = smallestFirst.find((entry) => entry.organization.type === "POWIAT");
  return powiat?.organization ?? null;
}

/* ------------------------------------------------------------------ */
/* Upraszczanie granic                                                 */
/* ------------------------------------------------------------------ */

/**
 * Przelicza metry na stopnie w obu osiach dla danej szerokości.
 * Wystarcza do decyzji „czy punkt odejścia jest w tolerancji" — nie służy
 * do precyzyjnych pomiarów geodezyjnych.
 */
function metersPerDegree(lat: number) {
  const degreesToRadians = Math.PI / 180;
  return {
    lat: 111_132.95,
    lng: 111_319.49 * Math.cos(lat * degreesToRadians),
  };
}

/** Kwadrat odległości punktu od odcinka, w stopniach przeliczonych na metry. */
function squaredDistanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  scaleX: number,
  scaleY: number
) {
  const x = (px - ax) * scaleX;
  const y = (py - ay) * scaleY;
  const dx = (bx - ax) * scaleX;
  const dy = (by - ay) * scaleY;

  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return x * x + y * y;

  let t = (x * dx + y * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const cx = x - t * dx;
  const cy = y - t * dy;

  return cx * cx + cy * cy;
}

/**
 * Upraszcza pierścień algorytmem Ramera–Douglasa–Peuckera.
 *
 * Granice administracyjne z OSM mają tysiące wierzchołków (Gmina Gorlice: 5658),
 * co potrafi zamulić mapę — Terra Draw tworzy wtedy osobny punkt dla każdego
 * wierzchołka. Tolerancja rzędu kilkunastu metrów jest wizualnie nierozróżnialna,
 * a przy przypisywaniu zgłoszeń (decyzja gmina vs. powiat) całkowicie bez znaczenia.
 *
 * Pierścień wejściowy i wyjściowy są domknięte (pierwszy punkt = ostatni).
 */
function simplifyRing(ring: LinearRing, tolerance: number, lat: number): LinearRing {
  if (ring.length <= 4) return ring;

  const { lat: scaleY, lng: scaleX } = metersPerDegree(lat);
  const toleranceSquared = tolerance * tolerance;

  // Pierścień domknięty — ostatni punkt dubluje pierwszy, więc go pomijamy.
  const points = ring.slice(0, -1);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = 0;

    for (let i = first + 1; i < last; i++) {
      const distance = squaredDistanceToSegment(
        points[i][0],
        points[i][1],
        points[first][0],
        points[first][1],
        points[last][0],
        points[last][1],
        scaleX,
        scaleY
      );

      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }

    if (farthestDistance > toleranceSquared && farthest > first) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  const simplified = points.filter((_, index) => keep[index] === 1);
  if (simplified.length < 3) return ring;

  simplified.push([...simplified[0]] as Position);
  return simplified;
}

/**
 * Upraszcza całą granicę. Zwraca nową granicę — nie modyfikuje wejściowej.
 * `tolerance` podajemy w metrach; 0 zwraca kopię bez zmian.
 */
export function simplifyBoundary(boundary: Boundary, tolerance = 15): Boundary {
  if (tolerance <= 0) return boundary;

  const polygons: PolygonCoords[] =
    boundary.type === "Polygon"
      ? [boundary.coordinates as PolygonCoords]
      : (boundary.coordinates as MultiPolygonCoords);

  const simplified = polygons
    .map((polygon) =>
      polygon.map((ring) => {
        const lat = ring[0]?.[1] ?? 52;
        return simplifyRing(ring, tolerance, lat);
      })
    )
    .filter((polygon) => polygon[0] && polygon[0].length >= 4);

  if (!simplified.length) return boundary;

  return {
    type: "MultiPolygon",
    coordinates: simplified,
  } as Boundary;
}

/** Liczba wierzchołków granicy — do liczników i decyzji o optymalizacji. */
export function countVertices(boundary: Boundary): number {
  const polygons: PolygonCoords[] =
    boundary.type === "Polygon"
      ? [boundary.coordinates as PolygonCoords]
      : (boundary.coordinates as MultiPolygonCoords);

  let total = 0;
  for (const polygon of polygons) for (const ring of polygon) total += ring.length;
  return total;
}

