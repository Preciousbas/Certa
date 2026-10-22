import { getDatabase, projects, seedDemo, users } from "@certa/db";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as fund } from "../../apps/web/app/api/mini/fund/route";
import { POST as review } from "../../apps/web/app/api/mini/review/route";
import { GET as adminSession } from "../../apps/web/app/api/admin/session/route";
import { POST as login } from "../../apps/web/app/api/auth/telegram/route";
import { resetLimits } from "../../src/server/auth/rateLimit";
import { sealSession } from "../../src/server/auth/session";
import { signInitData } from "../../src/server/auth/telegramInitData";

delete process.env.DATABASE_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.TELEGRAM_BOT_TOKEN = "123456:fake-bot-token";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.APP_URL = "http://localhost:3000";
process.env.DEMO_SEED = "true";

const token = process.env.TELEGRAM_BOT_TOKEN;

function tma(telegramId: number) {
  const now = Math.floor(Date.now() / 1000);
  return signInitData(
    { auth_date: String(now), user: JSON.stringify({ id: telegramId, first_name: "Ada" }) },
    token,
  );
}

function post(handler: (request: Request) => Promise<Response>, projectId: string, telegramId: number) {
  return handler(
    new Request("http://localhost/api/mini/action", {
      method: "POST",
      headers: { authorization: `tma ${tma(telegramId)}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId, stageId: projectId, decision: "approve", upToStage: 0, idempotencyKey: "contractor-must-not-fund" }),
    }),
  );
}

describe("authenticated actions", () => {
  let projectId = "";

  beforeAll(async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const project = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    if (!project) throw new Error("sample project missing");
    projectId = project.id;
  });

  beforeEach(() => {
    resetLimits();
  });

  it("rejects a contractor calling fund and review", async () => {
    const funded = await post(fund, projectId, 1003);
    const reviewed = await post(review, projectId, 1003);
    expect(funded.status).toBe(403);
    expect(reviewed.status).toBe(403);
    const fundBody = (await funded.json()) as { error: string; message: string };
    const reviewBody = (await reviewed.json()) as { error: string; message: string };
    expect(fundBody).toMatchObject({
      error: "forbidden",
      message: "You don't have permission to do this on this project.",
    });
    expect(reviewBody.error).toBe("forbidden");
  });

  it("hides admin from a logged-out caller and opens it for an allowlisted platform admin", async () => {
    const loggedOut = await adminSession(new Request("http://localhost/api/admin/session"));
    expect(loggedOut.status).toBe(404);
    expect(await loggedOut.text()).toBe("");

    const db = await getDatabase();
    const [admin] = await db
      .insert(users)
      .values({ telegramId: 4242n, name: "Platform admin", platformRole: "platform_admin" })
      .returning();
    if (!admin) throw new Error("admin missing");
    process.env.ADMIN_TELEGRAM_IDS = "4242";
    const sealed = await sealSession({ userId: admin.id, telegramId: "4242" });
    const allowed = await adminSession(
      new Request("http://localhost/api/admin/session", { headers: { cookie: `certa_session=${sealed.token}` } }),
    );
    expect(allowed.status).toBe(200);

    await db.update(users).set({ platformRole: "user" }).where(eq(users.id, admin.id));
    const demoted = await sealSession({ userId: admin.id, telegramId: "4242" });
    const hidden = await adminSession(
      new Request("http://localhost/api/admin/session", { headers: { cookie: `certa_session=${demoted.token}` } }),
    );
    expect(hidden.status).toBe(404);
  });

  it("rate limits login with the exact message", async () => {
    process.env.RATE_LIMIT_LOGIN_PER_MIN = "2";
    resetLimits();
    const send = () =>
      login(
        new Request("http://localhost/api/auth/telegram", {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ id: "1", auth_date: "1", hash: "ab" }),
        }),
      );
    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(401);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({
      error: "rate_limited",
      message: "Too many requests. Please wait a minute and try again.",
    });
    delete process.env.RATE_LIMIT_LOGIN_PER_MIN;
  });
});
