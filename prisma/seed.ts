import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";

const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://");
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting seed...");

  await prisma.statusHistory.deleteMany();
  await prisma.reportPhoto.deleteMany();
  await prisma.report.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const powiat = await prisma.organization.create({
    data: {
      name: "Powiat Gorlicki",
      slug: "powiat-gorlicki",
      type: "POWIAT",
      description: "Jednostka nadrzędna dla gmin i raportowania w regionie",
    },
  });

  const gminaGorlice = await prisma.organization.create({
    data: {
      name: "Gmina Gorlice",
      slug: "gmina-gorlice",
      type: "GMINA",
      parentId: powiat.id,
      description: "Obsługa centrum Gorlic oraz osiedli przyległych",
    },
  });

  const gminaRopa = await prisma.organization.create({
    data: {
      name: "Gmina Ropa",
      slug: "gmina-ropa",
      type: "GMINA",
      parentId: powiat.id,
      description: "Obszar turystyczny i infrastruktura drogowa",
    },
  });

  const gminaSzymbark = await prisma.organization.create({
    data: {
      name: "Gmina Szymbark",
      slug: "gmina-szymbark",
      type: "GMINA",
      parentId: powiat.id,
      description: "Obszar szkół, przystanków i dróg lokalnych",
    },
  });

  const [superAdmin, adminPowiat, adminGorlice, adminRopa, moderatorGorlice, moderatorSzymbark] =
    await Promise.all([
      prisma.user.create({
        data: {
          email: "superadmin@bezpiecznemiasto.pl",
          password: await hash("password123", 10),
          name: "Super Admin Systemu",
          role: "SUPER_ADMIN",
          organizationId: powiat.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "admin@powiat.pl",
          password: await hash("password123", 10),
          name: "Admin Powiatu",
          role: "ADMIN",
          organizationId: powiat.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "admin@gorlice.pl",
          password: await hash("password123", 10),
          name: "Admin Gorlice",
          role: "ADMIN",
          organizationId: gminaGorlice.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "admin@ropa.pl",
          password: await hash("password123", 10),
          name: "Admin Ropa",
          role: "ADMIN",
          organizationId: gminaRopa.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "mod@gorlice.pl",
          password: await hash("password123", 10),
          name: "Moderator Gorlice",
          role: "MODERATOR",
          organizationId: gminaGorlice.id,
        },
      }),
      prisma.user.create({
        data: {
          email: "mod@szymbark.pl",
          password: await hash("password123", 10),
          name: "Moderator Szymbark",
          role: "MODERATOR",
          organizationId: gminaSzymbark.id,
        },
      }),
    ]);

  const locations = await Promise.all([
    prisma.location.create({
      data: {
        name: "Park Miejski Gorlice",
        address: "ul. Wróblewskiego 1, Gorlice",
        description: "Strefa spacerowa i plac zabaw",
        latitude: 49.6547,
        longitude: 21.1608,
        organizationId: gminaGorlice.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Rynek Gorlice",
        address: "Rynek 1, Gorlice",
        description: "Centrum miasta",
        latitude: 49.6542,
        longitude: 21.1592,
        organizationId: gminaGorlice.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Przystanek Dworcowa",
        address: "ul. Dworcowa 8, Gorlice",
        description: "Węzeł komunikacyjny",
        latitude: 49.6561,
        longitude: 21.1636,
        organizationId: gminaGorlice.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Zapora Ropa",
        address: "Ropa 120, Ropa",
        description: "Teren rekreacyjny i droga dojazdowa",
        latitude: 49.6266,
        longitude: 21.0833,
        organizationId: gminaRopa.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Szkoła Podstawowa Ropa",
        address: "ul. Szkolna 2, Ropa",
        description: "Okolice szkoły i boiska",
        latitude: 49.6209,
        longitude: 21.0501,
        organizationId: gminaRopa.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Osiedle Szymbark Południe",
        address: "Szymbark 310, Szymbark",
        description: "Droga osiedlowa i chodniki",
        latitude: 49.6221,
        longitude: 21.1189,
        organizationId: gminaSzymbark.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Przystanek Szymbark Centrum",
        address: "Szymbark 545, Szymbark",
        description: "Przystanek i przejście dla pieszych",
        latitude: 49.6272,
        longitude: 21.1153,
        organizationId: gminaSzymbark.id,
      },
    }),
    prisma.location.create({
      data: {
        name: "Droga Powiatowa 1486K",
        address: "Powiat Gorlicki, odcinek miejski",
        description: "Nawierzchnia i pobocze",
        latitude: 49.6514,
        longitude: 21.1711,
        organizationId: powiat.id,
      },
    }),
  ]);

  const reportsInput = [
    {
      locationId: locations[0].id,
      reporterName: "Jan Kowalski",
      reporterEmail: "jan.kowalski@example.com",
      reporterPhone: "601 111 222",
      description: "Uszkodzona huśtawka na placu zabaw, poluzowane mocowanie.",
      status: "NEW" as const,
      createdAt: new Date("2026-05-10T08:20:00Z"),
      changedById: null,
      note: null,
    },
    {
      locationId: locations[1].id,
      reporterName: "Maria Nowak",
      reporterEmail: "maria.nowak@example.com",
      reporterPhone: "602 222 333",
      description: "Nie działa część oświetlenia przy rynku od strony urzędu.",
      status: "ANALYSIS" as const,
      createdAt: new Date("2026-05-09T19:10:00Z"),
      changedById: adminGorlice.id,
      note: "Zgłoszono do działu oświetlenia, oczekujemy na kosztorys.",
    },
    {
      locationId: locations[2].id,
      reporterName: "Paweł Zieliński",
      reporterEmail: "pawel.zielinski@example.com",
      reporterPhone: "603 333 444",
      description: "Pęknięta płyta chodnikowa przy zatoce autobusowej.",
      status: "IN_PROGRESS" as const,
      createdAt: new Date("2026-05-08T11:45:00Z"),
      changedById: moderatorGorlice.id,
      note: "Zlecenie naprawy przekazane ekipie technicznej.",
    },
    {
      locationId: locations[3].id,
      reporterName: "Agnieszka Maj",
      reporterEmail: "agnieszka.maj@example.com",
      reporterPhone: "604 444 555",
      description: "Uszkodzona barierka przy ścieżce spacerowej.",
      status: "RESOLVED" as const,
      createdAt: new Date("2026-05-06T07:35:00Z"),
      changedById: adminRopa.id,
      note: "Barierka wymieniona, odbiór techniczny zakończony.",
    },
    {
      locationId: locations[4].id,
      reporterName: "Kamil Wójcik",
      reporterEmail: "kamil.wojcik@example.com",
      reporterPhone: "605 555 666",
      description: "Znak przejścia dla pieszych zasłonięty przez gałęzie.",
      status: "NEW" as const,
      createdAt: new Date("2026-05-11T13:05:00Z"),
      changedById: null,
      note: null,
    },
    {
      locationId: locations[5].id,
      reporterName: "Ewa Rutkowska",
      reporterEmail: "ewa.rutkowska@example.com",
      reporterPhone: "606 666 777",
      description: "Rozlewisko po deszczu blokuje fragment chodnika.",
      status: "ANALYSIS" as const,
      createdAt: new Date("2026-05-12T09:50:00Z"),
      changedById: moderatorSzymbark.id,
      note: "Weryfikujemy drożność studzienek i odpływu.",
    },
    {
      locationId: locations[6].id,
      reporterName: "Andrzej Bąk",
      reporterEmail: "andrzej.bak@example.com",
      reporterPhone: "607 777 888",
      description: "Wybite szkło w wiacie przystankowej.",
      status: "IN_PROGRESS" as const,
      createdAt: new Date("2026-05-07T16:18:00Z"),
      changedById: moderatorSzymbark.id,
      note: "Zamówiono nową szybę, montaż jutro rano.",
    },
    {
      locationId: locations[7].id,
      reporterName: "Monika Król",
      reporterEmail: "monika.krol@example.com",
      reporterPhone: "608 888 999",
      description: "Ubytek nawierzchni na pasie jezdni, ryzyko uszkodzeń pojazdów.",
      status: "RESOLVED" as const,
      createdAt: new Date("2026-05-05T10:02:00Z"),
      changedById: adminPowiat.id,
      note: "Naprawa wykonana masą bitumiczną.",
    },
    {
      locationId: locations[1].id,
      reporterName: "Piotr Lupa",
      reporterEmail: "piotr.lupa@example.com",
      reporterPhone: "609 999 111",
      description: "Niedziałająca sygnalizacja przy przejściu na rynku.",
      status: "NEW" as const,
      createdAt: new Date("2026-05-13T20:30:00Z"),
      changedById: null,
      note: null,
    },
    {
      locationId: locations[0].id,
      reporterName: "Aleksandra Cieśla",
      reporterEmail: "aleksandra.ciesla@example.com",
      reporterPhone: "610 111 222",
      description: "Kosz na śmieci przewrócony i uszkodzony przy alejce głównej.",
      status: "ANALYSIS" as const,
      createdAt: new Date("2026-05-14T06:42:00Z"),
      changedById: adminGorlice.id,
      note: "Wysłano zlecenie wymiany kosza.",
    },
    {
      locationId: locations[2].id,
      reporterName: "Marek Turek",
      reporterEmail: "marek.turek@example.com",
      reporterPhone: "611 222 333",
      description: "Zalana zatoka autobusowa po nocnej ulewie.",
      status: "IN_PROGRESS" as const,
      createdAt: new Date("2026-05-15T09:27:00Z"),
      changedById: moderatorGorlice.id,
      note: "Trwa udrażnianie odpływu.",
    },
    {
      locationId: locations[4].id,
      reporterName: "Joanna Faber",
      reporterEmail: "joanna.faber@example.com",
      reporterPhone: "612 333 444",
      description: "Brak tabliczki informacyjnej przy szkole.",
      status: "RESOLVED" as const,
      createdAt: new Date("2026-05-04T14:05:00Z"),
      changedById: adminRopa.id,
      note: "Nowa tabliczka zamontowana.",
    },
  ];

  for (const item of reportsInput) {
    const reportLocation = locations.find((loc) => loc.id === item.locationId);
    if (!reportLocation) {
      throw new Error(`Missing location for report seed item: ${item.locationId}`);
    }

    const report = await prisma.report.create({
      data: {
        locationId: item.locationId,
        organizationId: reportLocation.organizationId,
        reportLatitude: reportLocation.latitude,
        reportLongitude: reportLocation.longitude,
        reportAddress: reportLocation.address,
        reportPlaceName: reportLocation.name,
        reporterName: item.reporterName,
        reporterEmail: item.reporterEmail,
        reporterPhone: item.reporterPhone,
        description: item.description,
        status: item.status,
        createdAt: item.createdAt,
      },
    });

    if (item.changedById && item.note) {
      await prisma.statusHistory.create({
        data: {
          reportId: report.id,
          status: item.status,
          note: item.note,
          changedById: item.changedById,
          createdAt: new Date(item.createdAt.getTime() + 36 * 60 * 60 * 1000),
        },
      });
    }
  }

  await prisma.statusHistory.create({
    data: {
      reportId: (await prisma.report.findFirstOrThrow({ where: { status: "RESOLVED" } })).id,
      status: "RESOLVED",
      note: "Zadanie zamknięte i potwierdzone przez nadzór powiatu.",
      changedById: superAdmin.id,
      createdAt: new Date("2026-05-17T08:00:00Z"),
    },
  });

  console.log("✅ Seed completed with MVP demo data!");
  console.log("- Organizations: 4");
  console.log("- Users: 6");
  console.log("- Locations: 8");
  console.log("- Reports: 12");
  console.log("- Status history entries: 9");

  console.log("\n📝 Demo credentials:");
  console.log("  Email: superadmin@bezpiecznemiasto.pl | admin@powiat.pl | admin@gorlice.pl");
  console.log("  Password: password123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
