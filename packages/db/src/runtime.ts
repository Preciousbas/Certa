import { createMemoryDatabase, migrationNamed, migrationSql, type Database } from "./client.js";
import * as schema from "./schema.js";
import { deleteAnonymousFund } from "./services.js";
const globalForDb = globalThis as { certaDb?: Promise<Database> };

async function open(): Promise<Database> {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
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
    }
    const db = drizzle(client, { schema }) as unknown as Database;
    await deleteAnonymousFund(db);
    return db;
  }
  const opened = await createMemoryDatabase();
  await deleteAnonymousFund(opened.db);
  return opened.db;
}

export function getDatabase(): Promise<Database> {
  if (!globalForDb.certaDb) globalForDb.certaDb = open();
  return globalForDb.certaDb;
}
