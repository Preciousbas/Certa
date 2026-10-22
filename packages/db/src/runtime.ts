import { createMemoryDatabase, migrationNamed, migrationSql, type Database } from "./client.js";
import * as schema from "./schema.js";
import { deleteAnonymousFund } from "./services.js";

type SqlHandle = { end: (options?: { timeout?: number }) => Promise<void> };

const globalForDb = globalThis as {
  certaDb?: Promise<Database>;
  certaSql?: SqlHandle;
  certaClose?: () => Promise<void>;
};

export type DatabaseOptions = { migrate?: boolean };

function migrationsEnabled(options?: DatabaseOptions): boolean {
  if (options?.migrate === false) return false;
  return process.env.CERTA_SKIP_MIGRATIONS !== "1";
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
  if (sql) await sql.end({ timeout: 5 });
  if (close) await close();
}

async function open(options?: DatabaseOptions): Promise<Database> {
  const migrate = migrationsEnabled(options);
  if (migrate) noteMigrationRunner();
  if (process.env.DATABASE_URL && process.env.PLAYWRIGHT !== "1") {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    globalForDb.certaSql = client;
    if (migrate) {
      const found = await client<
        { name: string | null }[]
      >`select to_regclass('public.users') as name`;
      if (!found[0]?.name) await client.unsafe(migrationSql());
      else {
        await client.unsafe(
          "ALTER TABLE capture_nonces ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES stages(id); DELETE FROM payments WHERE id = '7786f304-faf8-45e7-9aab-6b4df6882c8e';",
        );
        const jobsTable = await client<
          { name: string | null }[]
        >`select to_regclass('public.jobs') as name`;
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
      }
    }
    const db = drizzle(client, { schema }) as unknown as Database;
    await deleteAnonymousFund(db);
    return db;
  }
  const opened = await createMemoryDatabase();
  globalForDb.certaClose = opened.close;
  await deleteAnonymousFund(opened.db);
  if (process.env.PLAYWRIGHT === "1") {
    const { seedDemo } = await import("./seed.js");
    await seedDemo(opened.db);
  }
  return opened.db;
}

export function getDatabase(options?: DatabaseOptions): Promise<Database> {
  if (!globalForDb.certaDb) globalForDb.certaDb = open(options);
  return globalForDb.certaDb;
}
