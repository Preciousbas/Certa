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
  await sql.end();
  process.stdout.write("migrated\n");
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "migrate failed\n");
  process.exit(1);
});
