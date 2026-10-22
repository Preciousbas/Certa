import { getDatabase, projects, seedDemo, signInitData } from "@certa/db";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as certificate } from "./[id]/stages/[n]/certificate/route";
import { GET as report } from "./[id]/report/route";

delete process.env.DATABASE_URL;
process.env.DEMO_SEED = "true";
process.env.DEMO_MODE = "1";
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.APP_URL = "http://localhost:3000";

const token = process.env.TELEGRAM_BOT_TOKEN;
const outsider = 909_001;

function initData(telegramId: number) {
  const now = Math.floor(Date.now() / 1000);
  return signInitData(
    { auth_date: String(now), user: JSON.stringify({ id: telegramId, first_name: "Ada" }) },
    token,
  );
}

function get(path: string, telegramId?: number) {
  const headers = new Headers();
  if (telegramId) headers.set("authorization", `tma ${initData(telegramId)}`);
  return new Request(`http://localhost${path}`, { headers });
}

describe("project download auth", () => {
  let projectId = "";

  beforeAll(async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const project = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    if (!project) throw new Error("sample project missing");
    projectId = project.id;
  }, 30_000);

  it("rejects an unsigned report", async () => {
    const response = await report(get(`/api/projects/${projectId}/report`), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_signed_in");
    expect(body.message).toBe("Sign in from Telegram.");
  });

  it("rejects a signed-in user who is not on the project report", async () => {
    const response = await report(get(`/api/projects/${projectId}/report`, outsider), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("You don't have permission to do this on this project.");
  });

  it("rejects an unsigned certificate", async () => {
    const response = await certificate(get(`/api/projects/${projectId}/stages/1/certificate`), {
      params: Promise.resolve({ id: projectId, n: "1" }),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("not_signed_in");
    expect(body.message).toBe("Sign in from Telegram.");
  });

  it("rejects a signed-in user who is not on the project certificate", async () => {
    const response = await certificate(get(`/api/projects/${projectId}/stages/1/certificate`, outsider), {
      params: Promise.resolve({ id: projectId, n: "1" }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("forbidden");
    expect(body.message).toBe("You don't have permission to do this on this project.");
  });
});
