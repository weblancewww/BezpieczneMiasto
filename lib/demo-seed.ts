/**
 * Demo seed — wspólna logika zasilania bazy danymi prezentacyjnymi.
 *
 * Używana w dwóch miejscach:
 *  - CLI: `npm run db:seed` (prisma/seed.ts),
 *  - panel: przycisk „Zastosuj SEED" w ustawieniach (app/api/settings/seed).
 *
 * Operacja jest destrukcyjna (czyści bazę), więc trzymamy ją w jednym miejscu,
 * żeby CLI i panel robiły dokładnie to samo i nie rozjechały się z czasem.
 */
import { hash } from "bcryptjs";
import { readFileSync } from "fs";
import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  findOrganizationForPoint,
  parseBoundary,
  type Boundary,
  type OrganizationBoundary,
} from "./geo";

export const DEMO_PASSWORD = "password123";

/**
 * Startowa konfiguracja poczty. Hasła tu nie ma — nie trzymamy poświadczeń
 * w repozytorium. Uzupełnia się je raz w Ustawieniach i zostaje w bazie,
 * bo SEED nie rusza tabeli `SmtpSetting`.
 */
export const DEMO_SMTP_DEFAULTS = {
  host: "s167.cyber-folks.pl",
  port: 587,
  secure: false,
  username: "devs@weblance.pl",
  fromEmail: "devs@weblance.pl",
  fromName: "Bezpieczne Miasto",
};

export const DEMO_ACCOUNTS = [
  { email: "superadmin@bezpiecznemiasto.pl", label: "Super Admin" },
  { email: "admin@powiat.pl", label: "Admin powiatu" },
  { email: "admin@gorlice.pl", label: "Admin Gminy Gorlice" },
  { email: "admin@ropa.pl", label: "Admin Gminy Ropa" },
  { email: "mod@gorlice.pl", label: "Moderator Gminy Gorlice" },
  { email: "mod@biecz.pl", label: "Moderator Gminy Biecz" },
];

export type DemoSeedSummary = {
  organizations: number;
  users: number;
  locations: number;
  reports: number;
  /** Zgłoszenia, które wyszły poza wszystkie granice (kolejka „Nieprzypisane"). */
  unassigned: number;
  statusHistory: number;
  /** Czy udało się wyczyścić pliki zdjęć z public/uploads. */
  uploadsCleared: boolean;
};

/**
 * Prawdziwe granice administracyjne z OpenStreetMap (patrz README sekcja granic).
 * Pliki odtwarza `npm run boundary:import`. Czytamy je w czasie działania, bo
 * katalog `prisma/` jest kopiowany do obrazu produkcyjnego (Dockerfile).
 */
function readBoundaryFile(file: string): Boundary {
  const raw = readFileSync(join(process.cwd(), "prisma", "data", file), "utf8");
  const parsed = parseBoundary(JSON.parse(raw));

  if (!parsed) {
    throw new Error(`Niepoprawna granica w prisma/data/${file} — uruchom: npm run boundary:import`);
  }

  return parsed;
}

/** Data sprzed `daysAgo` dni, o podanej godzinie UTC — demo zawsze wygląda świeżo. */
function daysAgo(days: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

/**
 * Usuwa zdjęcia zgłoszeń z dysku. Zdjęcia leżą poza bazą, więc kaskada ich nie
 * ruszy. Kasujemy zawartość `public/uploads` (katalogi per zgłoszenie), ale sam
 * katalog i `.gitkeep` zostawiamy — inaczej zniknie ścieżka z repozytorium.
 *
 * Zwraca `false` przy dowolnym błędzie (np. read-only FS) — to kosmetyka,
 * nie może przewrócić całego seeda.
 */
async function clearUploads(): Promise<boolean> {
  const uploadsRoot = join(process.cwd(), "public", "uploads");

  try {
    const entries = await readdir(uploadsRoot, { withFileTypes: true });

    await Promise.all(
      entries
        .filter((entry) => entry.name !== ".gitkeep")
        .map((entry) =>
          rm(join(uploadsRoot, entry.name), { recursive: true, force: true })
        )
    );

    await mkdir(uploadsRoot, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function applyDemoSeed(prisma: PrismaClient): Promise<DemoSeedSummary> {
  // Hasło liczymy raz — wcześniej było hashowane osobno dla każdego konta.
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  const boundaries = {
    powiat: readBoundaryFile("powiat-gorlicki.geojson"),
    gorlice: readBoundaryFile("gmina-gorlice.geojson"),
    ropa: readBoundaryFile("gmina-ropa.geojson"),
    biecz: readBoundaryFile("gmina-biecz.geojson"),
  };

  const summary = await prisma.$transaction(
    async (tx) => {
      // Kolejność wymuszona przez klucze obce.
      await tx.statusHistory.deleteMany();
      await tx.reportPhoto.deleteMany();
      await tx.report.deleteMany();
      await tx.location.deleteMany();
      await tx.user.deleteMany();
      await tx.organization.deleteMany();

      const powiat = await tx.organization.create({
        data: {
          name: "Powiat Gorlicki",
          slug: "powiat-gorlicki",
          type: "POWIAT",
          description: "Jednostka nadrzędna dla gmin i raportowania w regionie",
          adminArea: "Powiat Gorlicki",
          boundary: boundaries.powiat as unknown as Prisma.InputJsonValue,
        },
      });

      const gminaGorlice = await tx.organization.create({
        data: {
          name: "Gmina Gorlice",
          slug: "gmina-gorlice",
          type: "GMINA",
          parentId: powiat.id,
          description: "Obsługa centrum Gorlic oraz osiedli przyległych",
          adminArea: "Gmina Gorlice",
          boundary: boundaries.gorlice as unknown as Prisma.InputJsonValue,
        },
      });

      const gminaRopa = await tx.organization.create({
        data: {
          name: "Gmina Ropa",
          slug: "gmina-ropa",
          type: "GMINA",
          parentId: powiat.id,
          description: "Obszar turystyczny i infrastruktura drogowa",
          adminArea: "Gmina Ropa",
          boundary: boundaries.ropa as unknown as Prisma.InputJsonValue,
        },
      });

      const gminaBiecz = await tx.organization.create({
        data: {
          name: "Gmina Biecz",
          slug: "gmina-biecz",
          type: "GMINA",
          parentId: powiat.id,
          description: "Miasto i gmina w północnej części powiatu",
          adminArea: "Gmina Biecz",
          boundary: boundaries.biecz as unknown as Prisma.InputJsonValue,
        },
      });

      const [superAdmin, adminPowiat, adminGorlice, adminRopa, moderatorGorlice, moderatorBiecz] =
        await Promise.all([
          tx.user.create({
            data: {
              email: "superadmin@bezpiecznemiasto.pl",
              password: passwordHash,
              name: "Super Admin Systemu",
              role: "SUPER_ADMIN",
              organizationId: powiat.id,
            },
          }),
          tx.user.create({
            data: {
              email: "admin@powiat.pl",
              password: passwordHash,
              name: "Admin Powiatu",
              role: "ADMIN",
              organizationId: powiat.id,
            },
          }),
          tx.user.create({
            data: {
              email: "admin@gorlice.pl",
              password: passwordHash,
              name: "Admin Gorlice",
              role: "ADMIN",
              organizationId: gminaGorlice.id,
            },
          }),
          tx.user.create({
            data: {
              email: "admin@ropa.pl",
              password: passwordHash,
              name: "Admin Ropa",
              role: "ADMIN",
              organizationId: gminaRopa.id,
            },
          }),
          tx.user.create({
            data: {
              email: "mod@gorlice.pl",
              password: passwordHash,
              name: "Moderator Gorlice",
              role: "MODERATOR",
              organizationId: gminaGorlice.id,
            },
          }),
          tx.user.create({
            data: {
              email: "mod@biecz.pl",
              password: passwordHash,
              name: "Moderator Biecz",
              role: "MODERATOR",
              organizationId: gminaBiecz.id,
            },
          }),
        ]);

      const [
        parkMiejski,
        rynekGorlice,
        przystanekDworcowa,
        szkolaRopa,
        urzadRopa,
        rynekBiecz,
        szkolaBiecz,
        drogaPowiatowa,
      ] = await Promise.all([
        tx.location.create({
          data: {
            name: "Park Miejski Gorlice",
            address: "ul. Wróblewskiego 1, Gorlice",
            description: "Strefa spacerowa i plac zabaw",
            latitude: 49.6547,
            longitude: 21.1608,
            organizationId: gminaGorlice.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Rynek Gorlice",
            address: "Rynek 1, Gorlice",
            description: "Centrum miasta",
            latitude: 49.6542,
            longitude: 21.1592,
            organizationId: gminaGorlice.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Przystanek Dworcowa",
            address: "ul. Dworcowa 8, Gorlice",
            description: "Węzeł komunikacyjny",
            latitude: 49.6561,
            longitude: 21.1636,
            organizationId: gminaGorlice.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Szkoła Podstawowa nr 1 w Ropie",
            address: "Ropa 28, Ropa",
            description: "Okolice szkoły i boiska",
            latitude: 49.60128,
            longitude: 21.04366,
            organizationId: gminaRopa.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Urząd Gminy Ropa",
            address: "Ropa 733, Ropa",
            description: "Przystanek i przejście dla pieszych",
            latitude: 49.59954,
            longitude: 21.04437,
            organizationId: gminaRopa.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Rynek w Bieczu",
            address: "Plac Rynek, Biecz",
            description: "Centrum miasta, strefa spacerowa",
            latitude: 49.73069,
            longitude: 21.25051,
            organizationId: gminaBiecz.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Szkoła Podstawowa nr 2 w Bieczu",
            address: "ul. Ks. J. Bochniewicza, Biecz",
            description: "Okolice szkoły i boiska",
            latitude: 49.73104,
            longitude: 21.24657,
            organizationId: gminaBiecz.id,
          },
        }),
        tx.location.create({
          data: {
            name: "Droga Powiatowa 1486K",
            address: "Bobowa, odcinek powiatowy",
            description: "Nawierzchnia i pobocze",
            latitude: 49.70811,
            longitude: 20.942,
            organizationId: powiat.id,
          },
        }),
      ]);

      const locations = [
        parkMiejski,
        rynekGorlice,
        przystanekDworcowa,
        szkolaRopa,
        urzadRopa,
        rynekBiecz,
        szkolaBiecz,
        drogaPowiatowa,
      ];

      const reportsInput = [
        {
          location: parkMiejski,
          reporterName: "Jan Kowalski",
          reporterEmail: "jan.kowalski@example.com",
          reporterPhone: "601 111 222",
          description: "Uszkodzona huśtawka na placu zabaw, poluzowane mocowanie.",
          status: "NEW" as const,
          reportedAt: daysAgo(0, 8, 20),
          changedById: null,
          note: null,
        },
        {
          location: rynekGorlice,
          reporterName: "Maria Nowak",
          reporterEmail: "maria.nowak@example.com",
          reporterPhone: "602 222 333",
          description: "Nie działa część oświetlenia przy rynku od strony urzędu.",
          status: "ANALYSIS" as const,
          reportedAt: daysAgo(1, 19, 10),
          changedById: adminGorlice.id,
          note: "Zgłoszono do działu oświetlenia, oczekujemy na kosztorys.",
        },
        {
          location: przystanekDworcowa,
          reporterName: "Paweł Zieliński",
          reporterEmail: "pawel.zielinski@example.com",
          reporterPhone: "603 333 444",
          description: "Pęknięta płyta chodnikowa przy zatoce autobusowej.",
          status: "IN_PROGRESS" as const,
          reportedAt: daysAgo(2, 11, 45),
          changedById: moderatorGorlice.id,
          note: "Zlecenie naprawy przekazane ekipie technicznej.",
        },
        {
          location: szkolaRopa,
          reporterName: "Agnieszka Maj",
          reporterEmail: "agnieszka.maj@example.com",
          reporterPhone: "604 444 555",
          description: "Uszkodzona barierka przy ścieżce spacerowej.",
          status: "RESOLVED" as const,
          reportedAt: daysAgo(3, 7, 35),
          changedById: adminRopa.id,
          note: "Barierka wymieniona, odbiór techniczny zakończony.",
        },
        {
          location: urzadRopa,
          reporterName: "Kamil Wójcik",
          reporterEmail: "kamil.wojcik@example.com",
          reporterPhone: "605 555 666",
          description: "Znak przejścia dla pieszych zasłonięty przez gałęzie.",
          status: "NEW" as const,
          reportedAt: daysAgo(4, 13, 5),
          changedById: null,
          note: null,
        },
        {
          location: rynekBiecz,
          reporterName: "Ewa Rutkowska",
          reporterEmail: "ewa.rutkowska@example.com",
          reporterPhone: "606 666 777",
          description: "Rozlewisko po deszczu blokuje fragment chodnika.",
          status: "ANALYSIS" as const,
          reportedAt: daysAgo(5, 9, 50),
          changedById: moderatorBiecz.id,
          note: "Weryfikujemy drożność studzienek i odpływu.",
        },
        {
          location: szkolaBiecz,
          reporterName: "Andrzej Bąk",
          reporterEmail: "andrzej.bak@example.com",
          reporterPhone: "607 777 888",
          description: "Wybite szkło w wiacie przystankowej.",
          status: "IN_PROGRESS" as const,
          reportedAt: daysAgo(6, 16, 18),
          changedById: moderatorBiecz.id,
          note: "Zamówiono nową szybę, montaż jutro rano.",
        },
        {
          location: drogaPowiatowa,
          reporterName: "Monika Król",
          reporterEmail: "monika.krol@example.com",
          reporterPhone: "608 888 999",
          description: "Ubytek nawierzchni na pasie jezdni, ryzyko uszkodzeń pojazdów.",
          status: "RESOLVED" as const,
          reportedAt: daysAgo(7, 10, 2),
          changedById: adminPowiat.id,
          note: "Naprawa wykonana masą bitumiczną.",
        },
        {
          location: rynekGorlice,
          reporterName: "Piotr Lupa",
          reporterEmail: "piotr.lupa@example.com",
          reporterPhone: "609 999 111",
          description: "Niedziałająca sygnalizacja przy przejściu na rynku.",
          status: "NEW" as const,
          reportedAt: daysAgo(8, 20, 30),
          changedById: null,
          note: null,
        },
        {
          location: parkMiejski,
          reporterName: "Aleksandra Cieśla",
          reporterEmail: "aleksandra.ciesla@example.com",
          reporterPhone: "610 111 222",
          description: "Kosz na śmieci przewrócony i uszkodzony przy alejce głównej.",
          status: "ANALYSIS" as const,
          reportedAt: daysAgo(9, 6, 42),
          changedById: adminGorlice.id,
          note: "Wysłano zlecenie wymiany kosza.",
        },
      ];

      /* Przypisanie liczymy z geometrii, a nie z jednostki lokalizacji — dzięki
         temu demo przechodzi tę samą drogą co zgłoszenia z mapy. Jednostka
         lokalizacji jest tylko zabezpieczeniem, gdyby granice zostały zmienione
         i punkt wypadł poza wszystkie obszary. */
      const organizationsForGeo: OrganizationBoundary[] = [
        { id: powiat.id, name: powiat.name, type: "POWIAT", boundary: boundaries.powiat },
        { id: gminaGorlice.id, name: gminaGorlice.name, type: "GMINA", boundary: boundaries.gorlice },
        { id: gminaRopa.id, name: gminaRopa.name, type: "GMINA", boundary: boundaries.ropa },
        { id: gminaBiecz.id, name: gminaBiecz.name, type: "GMINA", boundary: boundaries.biecz },
      ];

      let unassigned = 0;
      let statusHistory = 0;

      for (const item of reportsInput) {
        const geometric = findOrganizationForPoint(
          organizationsForGeo,
          item.location.latitude,
          item.location.longitude
        );

        const organizationId = geometric?.id ?? item.location.organizationId;
        if (!geometric) unassigned += 1;

        const report = await tx.report.create({
          data: {
            locationId: item.location.id,
            organizationId,
            reportLatitude: item.location.latitude,
            reportLongitude: item.location.longitude,
            reportAddress: item.location.address,
            reportPlaceName: item.location.name,
            reporterName: item.reporterName,
            reporterEmail: item.reporterEmail,
            reporterPhone: item.reporterPhone,
            description: item.description,
            status: item.status,
            createdAt: item.reportedAt,
          },
        });

        if (item.changedById && item.note) {
          await tx.statusHistory.create({
            data: {
              reportId: report.id,
              status: item.status,
              note: item.note,
              changedById: item.changedById,
              createdAt: new Date(item.reportedAt.getTime() + 5 * 60 * 60 * 1000),
            },
          });
          statusHistory += 1;
        }
      }

      // Domknięcie jednego zgłoszenia przez nadzór powiatu — dla historii zmian.
      const resolved = await tx.report.findFirstOrThrow({
        where: { status: "RESOLVED" },
        orderBy: { createdAt: "desc" },
      });

      await tx.statusHistory.create({
        data: {
          reportId: resolved.id,
          status: "RESOLVED",
          note: "Zadanie zamknięte i potwierdzone przez nadzór powiatu.",
          changedById: superAdmin.id,
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      statusHistory += 1;

      return {
        organizations: 4,
        users: 6,
        locations: locations.length,
        reports: reportsInput.length,
        unassigned,
        statusHistory,
      };
    },
    { timeout: 60_000 }
  );

  // Dopiero po udanym resecie — nie chcemy skasować zdjęć, gdy zapis do bazy padł.
  const uploadsCleared = await clearUploads();

  /* Konfiguracji poczty SEED nie czyści — to ustawienie infrastruktury, a nie
     dane demonstracyjne, i nie może przepaść przy każdym pokazie. Tworzymy
     wiersz tylko wtedy, gdy go jeszcze nie ma; istniejącego nigdy nie nadpisujemy
     (inaczej skasowalibyśmy wpisane hasło). */
  await prisma.smtpSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...DEMO_SMTP_DEFAULTS },
    update: {},
  });

  return { ...summary, uploadsCleared };
}
