/* Test algorytmu geometrii — uruchamiany przez `npm run test:geo`. */
import {
  approximateAreaKm2,
  boundaryFromGeoJson,
  containsPoint,
  countVertices,
  findOrganizationForPoint,
  parseBoundary,
  simplifyBoundary,
  type Boundary,
  type LinearRing,
  type Position,
} from "../lib/geo";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` → otrzymano ${JSON.stringify(actual)}, oczekiwano ${JSON.stringify(expected)}`}`);
}

// kwadrat: lng 20..21, lat 49..50
const square: Boundary = {
  type: "Polygon",
  coordinates: [
    [
      [20, 49],
      [21, 49],
      [21, 50],
      [20, 50],
      [20, 49],
    ],
  ],
};

check("punkt wewnątrz kwadratu", containsPoint(square, 49.5, 20.5), true);
check("punkt poza kwadratem (północ)", containsPoint(square, 51, 20.5), false);
check("punkt poza kwadratem (zachód)", containsPoint(square, 49.5, 19.5), false);
check("punkt na narożniku (granica)", containsPoint(square, 49, 20), true);

// kwadrat z dziurą w środku
const outerRing = (square.coordinates as LinearRing[])[0];
const withHole: Boundary = {
  type: "Polygon",
  coordinates: [
    outerRing,
    [
      [20.4, 49.4],
      [20.6, 49.4],
      [20.6, 49.6],
      [20.4, 49.6],
      [20.4, 49.4],
    ],
  ],
};
check("punkt w dziurze → poza", containsPoint(withHole, 49.5, 20.5), false);
check("punkt w pierścieniu obok dziury", containsPoint(withHole, 49.45, 20.2), true);

// MultiPolygon: dwa rozłączne kwadraty
const multi: Boundary = {
  type: "MultiPolygon",
  coordinates: [
    square.coordinates as [number, number][][],
    [
      [
        [30, 60],
        [31, 60],
        [31, 61],
        [30, 61],
        [30, 60],
      ],
    ],
  ],
};
check("multipolygon – pierwszy człon", containsPoint(multi, 49.5, 20.5), true);
check("multipolygon – drugi człon", containsPoint(multi, 60.5, 30.5), true);
check("multipolygon – między członami", containsPoint(multi, 55, 25), false);

// powiat (duży) i gmina (mała, wewnątrz) — punkt w gminie
const powiat: Boundary = {
  type: "Polygon",
  coordinates: [
    [
      [19, 48],
      [23, 48],
      [23, 51],
      [19, 51],
      [19, 48],
    ],
  ],
};
const gmina: Boundary = square;

check("pole gminy < pole powiatu", approximateAreaKm2(gmina) < approximateAreaKm2(powiat), true);

const orgs = [
  { id: "powiat", name: "Powiat Testowy", type: "POWIAT" as const, boundary: powiat },
  { id: "gmina", name: "Gmina Testowa", type: "GMINA" as const, boundary: gmina },
];

check(
  "punkt w gminie → gmina (nie powiat)",
  findOrganizationForPoint(orgs, 49.5, 20.5)?.id,
  "gmina"
);
check(
  "punkt w powiecie, poza gminą → powiat",
  findOrganizationForPoint(orgs, 50.5, 22.5)?.id,
  "powiat"
);
check("punkt poza wszystkimi granicami → null", findOrganizationForPoint(orgs, 52.2, 21.0), null);

// Kraków vs Gorlice — sedno zgłoszonego błędu
const gorlice: Boundary = {
  type: "Polygon",
  coordinates: [
    [
      [20.9, 49.5],
      [21.4, 49.5],
      [21.4, 49.8],
      [20.9, 49.8],
      [20.9, 49.5],
    ],
  ],
};
const onlyGorlice = [
  { id: "gorlice", name: "Powiat Gorlicki", type: "POWIAT" as const, boundary: gorlice },
];
check(
  "Kraków (50.06, 19.94) nie trafia do Gorlic",
  findOrganizationForPoint(onlyGorlice, 50.0614, 19.9366),
  null
);
check(
  "Łącko (49.55, 20.43) nie trafia do Gorlic",
  findOrganizationForPoint(onlyGorlice, 49.55, 20.43),
  null
);
check(
  "punkt w Gorlicach trafia do Gorlic",
  findOrganizationForPoint(onlyGorlice, 49.65, 21.16)?.id,
  "gorlice"
);

// parsowanie
check("parseBoundary: null → null", parseBoundary(null), null);
check("parseBoundary: śmieci → null", parseBoundary("{nie-json"), null);
check("parseBoundary: za mało punktów → null", parseBoundary({ type: "Polygon", coordinates: [[[20, 49], [21, 49]]] }), null);
check("parseBoundary: poprawny → typ", parseBoundary(square)?.type, "Polygon");

// GeoJSON input
const featureCollection = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: square },
    { type: "Feature", properties: {}, geometry: square },
  ],
});
const merged = boundaryFromGeoJson(featureCollection);
check("boundaryFromGeoJson: FeatureCollection scala 2 wielokąty", "type" in merged ? merged.type : merged, "MultiPolygon");
check(
  "boundaryFromGeoJson: scala poprawnie liczbę",
  "coordinates" in merged ? (merged.coordinates as unknown[]).length : -1,
  2
);
check("boundaryFromGeoJson: zły JSON → błąd", "error" in boundaryFromGeoJson("{oops"), true);
check(
  "boundaryFromGeoJson: nieobsługiwany typ → błąd",
  "error" in boundaryFromGeoJson(JSON.stringify({ type: "Point", coordinates: [20, 49] })),
  true
);

/* ------------------------------------------------------------------ */
/* Upraszczanie granic                                                 */
/* ------------------------------------------------------------------ */

/** Gęsty okrąg — symuluje granicę z OSM (tysiące wierzchołków). */
function denseCircle(
  lat: number,
  lng: number,
  radiusMeters: number,
  points: number
): Boundary {
  const metersPerDegreeLat = 111_132.95;
  const metersPerDegreeLng = 111_319.49 * Math.cos((lat * Math.PI) / 180);
  const ring: Position[] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    ring.push([
      lng + (radiusMeters * Math.cos(angle)) / metersPerDegreeLng,
      lat + (radiusMeters * Math.sin(angle)) / metersPerDegreeLat,
    ]);
  }

  ring.push([...ring[0]]);
  return { type: "Polygon", coordinates: [ring] };
}

const dense = denseCircle(49.655, 21.16, 400, 3600);
const denseBefore = countVertices(dense);

check("countVertices: gęsty okrąg ma 3601 punktów", denseBefore, 3601);

const simplifiedDense = simplifyBoundary(dense, 15);
const denseAfter = countVertices(simplifiedDense);

check("simplify: drastycznie zmniejsza liczbę punktów", denseAfter < 100, true);
check("simplify: zachowuje minimum 4 punkty", denseAfter >= 4, true);
check("simplify: środek nadal wewnątrz", containsPoint(simplifiedDense, 49.655, 21.16), true);
check("simplify: punkt 350 m od środka nadal wewnątrz", containsPoint(simplifiedDense, 49.655, 21.16 + 350 / 80_000), true);
check("simplify: punkt 450 m od środka nadal na zewnątrz", containsPoint(simplifiedDense, 49.655, 21.16 + 450 / 80_000), false);

check("simplify: tolerancja 0 nie zmienia liczby punktów", countVertices(simplifyBoundary(dense, 0)), 3601);
check("simplify: kwadrat (5 pkt) bez zmian", countVertices(simplifyBoundary(square, 15)), 5);
check("simplify: pole okręgu w granicach ±5%", Math.abs(approximateAreaKm2(simplifiedDense) - approximateAreaKm2(dense)) / approximateAreaKm2(dense) < 0.05, true);

// Upraszczanie nie może rozspójnić przypisania gminy.
const simplifiedGmina = simplifyBoundary(
  { type: "Polygon", coordinates: [[[20, 49], [21, 49], [21, 50], [20, 50], [20, 49]]] },
  15
);
check("simplify: kwadrat nadal zawiera ten sam punkt", containsPoint(simplifiedGmina, 49.5, 20.5), true);

console.log(failed === 0 ? "\nWSZYSTKIE TESTY PRZESZŁY" : `\nBŁĘDÓW: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
