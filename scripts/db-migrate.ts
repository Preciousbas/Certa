import { migrationNamed } from "@certa/db";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write("DATABASE_URL is required\n");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const jobs = await sql<{ name: string | null }[]>`select to_regclass('public.jobs') as name`;
  if (!jobs[0]?.name) await sql.unsafe(migrationNamed("0002"));
  const versions = await sql<
    { name: string | null }[]
  >`select to_regclass('public.contract_versions') as name`;
  if (!versions[0]?.name) await sql.unsafe(migrationNamed("0003"));
  const platformRole = await sql<
    { name: string | null }[]
  >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'platform_role'`;
  if (!platformRole[0]?.name) await sql.unsafe(migrationNamed("0004"));
  const fileName = await sql<
    { name: string | null }[]
  >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'documents' and column_name = 'file_name'`;
  if (!fileName[0]?.name) await sql.unsafe(migrationNamed("0005"));
  const revokedAt = await sql<
    { name: string | null }[]
  >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'join_codes' and column_name = 'revoked_at'`;
  if (!revokedAt[0]?.name) await sql.unsafe(migrationNamed("0006"));
  const chainSync = await sql<
    { name: string | null }[]
  >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'chain_sync'`;
  if (!chainSync[0]?.name) await sql.unsafe(migrationNamed("0007"));
  const photoStage = await sql<
    { name: string | null }[]
  >`select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'photos' and column_name = 'stage_id'`;
  if (!photoStage[0]?.name) await sql.unsafe(migrationNamed("0008"));
  await sql.end();
  process.stdout.write("migrated\n");
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "migrate failed\n");
  process.exit(1);
});
