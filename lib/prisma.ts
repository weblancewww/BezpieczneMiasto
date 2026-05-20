import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const databaseUrl = (process.env.DATABASE_URL || "").replace(/^mysql:\/\//, "mariadb://");
const adapter = new PrismaMariaDb(databaseUrl);
const logConfig: Prisma.LogLevel[] | undefined =
  process.env.NODE_ENV === "development" ? ["query"] : undefined;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    ...(logConfig ? { log: logConfig } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
