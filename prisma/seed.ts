/**
 * CLI: `npm run db:seed`
 *
 * Cała logika siedzi w `lib/demo-seed.ts`, żeby ten sam zestaw danych mogły
 * zastosować CLI i przycisk „Zastosuj SEED" w ustawieniach panelu.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { applyDemoSeed, DEMO_ACCOUNTS, DEMO_PASSWORD } from "../lib/demo-seed";

const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

async function main() {
  console.log("🌱 Starting seed...");

  const summary = await applyDemoSeed(prisma);

  console.log("✅ Seed completed with MVP demo data!");
  console.log(`- Organizations: ${summary.organizations}`);
  console.log(`- Users: ${summary.users}`);
  console.log(`- Locations: ${summary.locations}`);
  console.log(`- Reports: ${summary.reports}`);
  console.log(`- Status history entries: ${summary.statusHistory}`);
  console.log(`- Katalog zdjęć wyczyszczony: ${summary.uploadsCleared ? "tak" : "nie"}`);

  if (summary.unassigned > 0) {
    console.log(`\n⚠️  ${summary.unassigned} zgłoszeń poza granicami (kolejka „Nieprzypisane")`);
  }

  console.log("\n📝 Demo credentials:");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.email.padEnd(34)} ${account.label}`);
  }
  console.log(`  Hasło dla wszystkich kont: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
