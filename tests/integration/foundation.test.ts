import { createMemoryDatabase } from "@certa/db";
import { describe, expect, it } from "vitest";

describe("foundation database", () => {
  it("enables row security on every public table and keeps the audit log append-only", async () => {
    const opened = await createMemoryDatabase();
    const open = await opened.client.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(open.rows).toEqual([]);
    await opened.client.exec(
      "insert into audit_log (action, entity, prev_hash, row_hash) values ('created', 'project', 'genesis', 'abc')",
    );
    await expect(opened.client.exec("update audit_log set action = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(opened.client.exec("delete from audit_log")).rejects.toThrow(/append-only/);
    await opened.close();
  });
});
