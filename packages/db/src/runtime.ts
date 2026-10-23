import { createMemoryDatabase, migrationNamed, migrationSql, type Database } from "./client.js";
import * as schema from "./schema.js";

type SqlHandle = { end: (options?: { timeout?: number }) => Promise<void> };

const globalForDb = globalThis as {
  certaDb?: Promise<Database>;
  certaSql?: SqlHandle;
  certaClose?: () => Promise<void>;
  certaMigrate?: boolean;
  certaMemory?: boolean;
};

/** Playwright may use the journey route and the demo seed only on the in-memory database, off Vercel. */
export function playwrightMemoryAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PLAYWRIGHT !== "1") return false;
  if (env.DATABASE_URL?.trim()) return false;
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") return false;
  return true;
}

/** True after getDatabase() has opened PGlite. False for Postgres and before the first open. */
export function isMemoryDatabase(): boolean {
  return globalForDb.certaMemory === true;
}

export type DatabaseOptions = { migrate?: boolean };

/** The verify worker must not change the schema. scripts/db-migrate.ts owns that. */
export function disableRuntimeMigrations(): void {
  globalForDb.certaMigrate = false;
}

/** Off unless CERTA_RUN_MIGRATIONS=1. CERTA_SKIP_MIGRATIONS=1 and disableRuntimeMigrations() stay off. */
export function runtimeMigrationsEnabled(
  env: NodeJS.ProcessEnv = process.env,
  disabled = globalForDb.certaMigrate === false,
): boolean {
  if (env.CERTA_SKIP_MIGRATIONS === "1") return false;
  if (disabled) return false;
  return env.CERTA_RUN_MIGRATIONS === "1";
}

function migrationsEnabled(options?: DatabaseOptions): boolean {
  if (options?.migrate === false) return false;
  return runtimeMigrationsEnabled();
}

function noteMigrationRunner(): void {
  if (process.env.CERTA_MIGRATION_SENTRY === "1") {
    throw new Error("migration runner called");
  }
}

export async function closeDatabase(): Promise<void> {
  const sql = globalForDb.certaSql;
  const close = globalForDb.certaClose;
  globalForDb.certaDb = undefined;
  globalForDb.certaSql = undefined;
  globalForDb.certaClose = undefined;
  globalForDb.certaMemory = false;
  if (sql) await sql.end({ timeout: 5 });
  if (close) await close();
}

async function open(options?: DatabaseOptions): Promise<Database> {
  const migrate = migrationsEnabled(options);
  if (migrate) noteMigrationRunner();
  if (process.env.DATABASE_URL?.trim() && process.env.PLAYWRIGHT !== "1") {
    globalForDb.certaMemory = false;
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    globalForDb.certaSql = client;
    if (migrate) {
      const found = await client<{ name: string | null }[]>`select to_regclass('public.users') as name`;
      if (!found[0]?.name) await client.unsafe(migrationSql());
      else {
        const jobsTable = await client<{ name: string | null }[]>`select to_regclass('public.jobs') as name`;
        if (!jobsTable[0]?.name) await client.unsafe(migrationNamed("0002"));
        const versions = await client<
          { name: string | null }[]
        >`select to_regclass('public.contract_versions') as name`;
        if (!versions[0]?.name) await client.unsafe(migrationNamed("0003"));
        const platformRole = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'platform_role'`;
        if (!platformRole[0]?.name) await client.unsafe(migrationNamed("0004"));
        const revokedAt = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'join_codes' and column_name = 'revoked_at'`;
        if (!revokedAt[0]?.name) await client.unsafe(migrationNamed("0006"));
        const chainSync = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'chain_sync'`;
        if (!chainSync[0]?.name) await client.unsafe(migrationNamed("0007"));
        const photoStage = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'photos' and column_name = 'stage_id'`;
        if (!photoStage[0]?.name) await client.unsafe(migrationNamed("0008"));
        const notifyChannel = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'memberships' and column_name = 'notify_channel'`;
        if (!notifyChannel[0]?.name) await client.unsafe(migrationNamed("0009"));
        const notificationStatus = await client<
          { name: string | null }[]
        >`select pg_get_constraintdef(oid) as name from pg_constraint where conname = 'notifications_status_check'`;
        if (!notificationStatus[0]?.name?.includes("blocked")) await client.unsafe(migrationNamed("0010"));
        const allowance = await client<
          { name: string | null }[]
        >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name = 'allowance_micro'`;
        if (!allowance[0]?.name) await client.unsafe(migrationNamed("0011"));
      }
    }
    const db = drizzle(client, { schema }) as unknown as Database;
    return db;
  }
  const opened = await createMemoryDatabase();
  globalForDb.certaClose = opened.close;
  globalForDb.certaMemory = true;
  if (playwrightMemoryAllowed()) {
    const { seedDemo } = await import("./seed.js");
    await seedDemo(opened.db);
  }
  return opened.db;
}

export function getDatabase(options?: DatabaseOptions): Promise<Database> {
  if (!globalForDb.certaDb) globalForDb.certaDb = open(options);
  return globalForDb.certaDb;
}
