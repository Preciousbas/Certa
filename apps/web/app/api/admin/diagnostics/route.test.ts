import { getDatabase, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { GET } from "./route";
import { sealSession } from "../../../../../../src/server/auth/session";

delete process.env.DATABASE_URL;
process.env.CERTA_SKIP_MIGRATIONS = "1";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.ADMIN_TELEGRAM_IDS = "4242";

describe("admin diagnostics", () => {
  beforeAll(async () => {
    const db = await getDatabase();
    await db.insert(users).values({ telegramId: 880099n, name: "Not an admin", platformRole: "user" });
  });

  it("returns 403 for a signed-out caller and for someone who is not an admin", async () => {
    const signedOut = await GET(new Request("http://127.0.0.1/api/admin/diagnostics"));
    expect(signedOut.status).toBe(403);
    const db = await getDatabase();
    const person = (await db.select().from(users).where(eq(users.telegramId, 880099n)))[0];
    if (!person) throw new Error("user missing");
    const sealed = await sealSession({ userId: person.id, telegramId: person.telegramId.toString() });
    const denied = await GET(
      new Request("http://127.0.0.1/api/admin/diagnostics", { headers: { cookie: `certa_session=${sealed.token}` } }),
    );
    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: string };
    expect(body.error).toBe("forbidden");
    expect(JSON.stringify(body)).not.toMatch(/CDP_API_KEY|DATABASE_URL|0x[a-fA-F0-9]{64}/);
  });
});
