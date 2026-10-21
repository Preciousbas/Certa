const url = process.env.DATABASE_URL ?? "";
const local = url === "" || url.includes("localhost") || url.includes("127.0.0.1");
if (!local) {
  process.stderr.write("db:reset is local only\n");
  process.exit(1);
}
process.stdout.write(
  "Local reset is a fresh in-memory database on the next boot. No remote database was touched.\n",
);
