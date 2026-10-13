import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

export type Database = PgliteDatabase<typeof schema>;

export function migrationSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "../migrations/0001_init.sql"), "utf8");
}

export async function createMemoryDatabase(): Promise<{ db: Database; client: PGlite; close: () => Promise<void> }> {
  const client = new PGlite();
  const text = migrationSql().replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
  await client.exec(text);
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.close() };
}

export async function withRole<T>(
  db: Database,
  settings: { userId: string; workspaceId?: string; workspaceRole?: string },
  fn: (db: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${settings.userId}, true)`);
    await tx.execute(sql`select set_config('app.current_workspace_id', ${settings.workspaceId ?? ""}, true)`);
    await tx.execute(sql`select set_config('app.current_workspace_role', ${settings.workspaceRole ?? ""}, true)`);
    await tx.execute(sql.raw("set local role certa_app"));
    return fn(tx as unknown as Database);
  });
}
