import { createMemoryDatabase, migrationSql, type Database } from "./client.js";
import * as schema from "./schema.js";
import { seedDemo } from "./seed.js";

const globalForDb = globalThis as { certaDb?: Promise<Database> };

async function open(): Promise<Database> {
  process.env.DEMO_MODE ??= "1";
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    const found = await client<{ name: string | null }[]>`select to_regclass('public.users') as name`;
    if (!found[0]?.name) {
      await client.unsafe(migrationSql());
    }
    const db = drizzle(client, { schema }) as unknown as Database;
    await seedDemo(db);
    return db;
  }
  const opened = await createMemoryDatabase();
  await seedDemo(opened.db);
  return opened.db;
}

export function getDatabase(): Promise<Database> {
  if (!globalForDb.certaDb) globalForDb.certaDb = open();
  return globalForDb.certaDb;
}
