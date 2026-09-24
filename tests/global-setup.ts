import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Each test run gets its own brand-new database (never an existing one), migrated with
 * `prisma migrate deploy` and seeded; it is dropped again when the run finishes.
 * TEST_DATABASE_BASE_URL must point at a local/dev Postgres server (default: the docker/dev one).
 */
const base = process.env.TEST_DATABASE_BASE_URL || "postgresql://mvm:mvm@localhost:5432";
const dbName = `mvm_test_${Date.now()}_${process.pid}`;

function admin() {
  return new PrismaClient({ datasources: { db: { url: `${base}/postgres` } } });
}

export async function setup() {
  const a = admin();
  await a.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await a.$disconnect();
  const url = `${base}/${dbName}`;
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const env = { ...process.env, ADMIN_EMAIL: "", ADMIN_PASSWORD: "" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}

export async function teardown() {
  const a = admin();
  await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await a.$disconnect();
}
