import { auditLog, getDatabase } from "@certa/db";
import { asc } from "drizzle-orm";

async function main() {
  const db = await getDatabase();
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.createdAt));
  let prev = "genesis";
  for (const row of rows) {
    if (row.prevHash !== prev) {
      process.stderr.write("audit chain break\n");
      process.exit(1);
    }
    prev = row.rowHash;
  }
  process.stdout.write("OK\n");
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "verify failed\n");
  process.exit(1);
});
