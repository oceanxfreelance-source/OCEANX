import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "./db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = runtimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
