/**
 * Pobiera granicę administracyjną z OpenStreetMap (Nominatim) i zapisuje ją
 * w formacie przyjmowanym przez `lib/geo.ts` (Polygon/MultiPolygon, [lng, lat]).
 *
 * Użycie:
 *   npx tsx scripts/import-osm-boundary.ts <plik-wynikowy> "<zapytanie>" ["<zapytanie>" ...]
 *   npx tsx scripts/import-osm-boundary.ts <plik-wynikowy> "<zapytanie>" --apply <slug-organizacji>
 *
 * Kilka zapytań jest scalanych w jeden MultiPolygon — przydaje się, gdy jedna
 * organizacja obsługuje np. miasto na prawach gminy i otaczającą je gminę wiejską.
 *
 * Granica jest upraszczana algorytmem Ramera–Douglasa–Peuckera, bo OSM zwraca
 * tysiące wierzchołków (Gmina Gorlice: 5658), co zamula mapę. Domyślna
 * tolerancja 25 m redukuje to do ~540 punktów przy zmianie pola poniżej 0,1%.
 *
 * Przykład:
 *   npx tsx scripts/import-osm-boundary.ts prisma/data/gmina-gorlice.geojson \
 *     "Gmina Gorlice" "Gorlice, powiat gorlicki"
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  approximateAreaKm2,
  countVertices,
  parseBoundary,
  simplifyBoundary,
  type Boundary,
} from "../lib/geo";

type GeoJson = {
  type: "Polygon" | "MultiPolygon" | string;
  coordinates: never;
};

const args = process.argv.slice(2);

/* Parsujemy pętlą, a nie filtrowaniem po indeksach — wcześniejsza wersja
   gubiła nazwę pliku, gdy podano `--apply` bez `--tolerance`. */
const positional: string[] = [];
let organizationSlug: string | null = null;
let tolerance = 25;

for (let index = 0; index < args.length; index++) {
  const arg = args[index];

  if (arg === "--apply") {
    organizationSlug = args[++index] ?? null;
    continue;
  }

  if (arg === "--tolerance") {
    const value = Number(args[++index]);
    if (!Number.isFinite(value) || value < 0) {
      console.error("--tolerance wymaga liczby metrów, np. --tolerance 25");
      process.exit(1);
    }
    tolerance = value;
    continue;
  }

  if (arg.startsWith("--")) {
    console.error(`Nieznana opcja: ${arg}`);
    process.exit(1);
  }

  positional.push(arg);
}

const [outFile, ...queries] = positional;

if (!outFile || queries.length === 0) {
  console.error(
    'Użycie: npx tsx scripts/import-osm-boundary.ts <plik> "<zapytanie>" ' +
      "[--tolerance <metry>] [--apply <slug>]"
  );
  process.exit(1);
}

/** Nominatim wymaga własnego User-Agent i nie lubi zalewania zapytaniami. */
const USER_AGENT = "BezpieczneMiasto/1.0 (panel operacyjny; kontakt: kamil@weblance.pl)";

const round = (value: number) => Math.round(value * 1e6) / 1e6;

function polygonsFrom(geojson: GeoJson): number[][][][] {
  if (geojson.type === "Polygon") return [geojson.coordinates];
  if (geojson.type === "MultiPolygon") return geojson.coordinates as never;
  return [];
}

/** Skraca precyzję, domyka pierścienie i wyrzuca zdegenerowane resztki. */
function clean(polygons: number[][][][]): number[][][][] {
  return polygons
    .map((polygon) =>
      polygon
        .map((ring) => {
          const result: number[][] = [];

          for (const [lng, lat] of ring) {
            const point = [round(lng), round(lat)];
            const last = result[result.length - 1];
            if (last && last[0] === point[0] && last[1] === point[1]) continue;
            result.push(point);
          }

          const first = result[0];
          const last = result[result.length - 1];
          if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
            result.push(first);
          }

          return result;
        })
        .filter((ring) => ring.length >= 4)
    )
    .filter((polygon) => polygon.length > 0);
}

async function fetchBoundary(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("polygon_geojson", "1");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!response.ok) {
    throw new Error(`Nominatim zwrócił ${response.status} dla "${query}"`);
  }

  const results = (await response.json()) as {
    display_name?: string;
    osm_type?: string;
    osm_id?: number;
    class?: string;
    type?: string;
    geojson?: GeoJson;
  }[];

  const best = results[0];

  if (!best?.geojson) {
    throw new Error(`Nie znaleziono granicy dla "${query}"`);
  }

  console.log(
    `  ${query} → ${best.osm_type}/${best.osm_id} ${best.display_name ?? ""} ` +
      `[${best.class ?? ""}/${best.type ?? ""}]`
  );

  return polygonsFrom(best.geojson);
}

async function main() {
  const collected: number[][][][] = [];

  for (const query of queries) {
    const polygons = clean(await fetchBoundary(query));

    for (const polygon of polygons) {
      const fingerprint = JSON.stringify(polygon);
      const duplicate = collected.some(
        (existing) => JSON.stringify(existing) === fingerprint
      );
      if (!duplicate) collected.push(polygon);
    }

    // Nominatim: maksymalnie 1 zapytanie na sekundę.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  const combined = {
    type: "MultiPolygon",
    coordinates: collected,
  } as Boundary;

  const rawVertices = countVertices(combined);
  const simplified = simplifyBoundary(combined, tolerance);
  const boundary = parseBoundary(simplified);

  if (!boundary) {
    throw new Error("Złożona granica nie przeszła walidacji parseBoundary");
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(boundary));

  console.log(
    `\nZapisano ${outFile}\n` +
      `  wielokątów: ${(boundary.coordinates as unknown[]).length}\n` +
      `  punktów:    ${rawVertices} → ${countVertices(boundary)} ` +
      `(tolerancja ${tolerance} m, usunięto ${rawVertices - countVertices(boundary)})\n` +
      `  pole:       ${approximateAreaKm2(boundary).toFixed(1)} km²`
  );

  if (!organizationSlug) return;

  const databaseUrl = (process.env.DATABASE_URL || "").replace(
    /^mysql:\/\//,
    "mariadb://"
  );
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug },
      select: { id: true, name: true },
    });

    if (!organization) {
      throw new Error(`Brak organizacji o slug "${organizationSlug}"`);
    }

    await prisma.organization.update({
      where: { id: organization.id },
      data: { boundary },
    });

    console.log(`Zaktualizowano granicę organizacji: ${organization.name}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
