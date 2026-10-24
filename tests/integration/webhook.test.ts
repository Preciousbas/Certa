import { createMemoryDatabase, jobs, telegramUpdates } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST } from "../../apps/web/app/api/telegram/route";
import { acceptTelegramUpdate } from "../../src/server/auth/webhook";

process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-test-secret";

function update(id: number, secret: string) {
  return new Request("http://localhost/api/telegram", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({ update_id: id, message: { text: "hello" } }),
  });
}

describe("telegram webhook", () => {
  it("rejects the wrong secret with an empty 401", async () => {
    const response = await POST(update(1, "wrong"));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("handles one update id once", async () => {
    const opened = await createMemoryDatabase();
    const seen: number[] = [];
    const first = await acceptTelegramUpdate(update(9, "webhook-test-secret"), {
      db: opened.db,
      dispatch: async (body) => {
        seen.push(body.update_id);
      },
    });
    const second = await acceptTelegramUpdate(update(9, "webhook-test-secret"), {
      db: opened.db,
      dispatch: async (body) => {
        seen.push(body.update_id);
      },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(seen).toEqual([9]);
    await opened.close();
  });

  it("marks a timed-out update done when the original handler finishes", async () => {
    const opened = await createMemoryDatabase();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let slow = Promise.resolve();
    const response = await acceptTelegramUpdate(update(11, "webhook-test-secret"), {
      db: opened.db,
      quickMs: 15,
      dispatch: () => gate,
      onSlow: (done) => {
        slow = done;
      },
    });
    expect(response.status).toBe(200);
    const queued = (await opened.db.select().from(jobs).where(eq(jobs.dedupeKey, "telegram.update:11")))[0];
    expect(queued?.status).toBe("queued");
    release();
    await slow;
    const finished = (await opened.db.select().from(jobs).where(eq(jobs.dedupeKey, "telegram.update:11")))[0];
    expect(finished?.status).toBe("succeeded");
    const stored = (await opened.db.select().from(telegramUpdates).where(eq(telegramUpdates.updateId, 11n)))[0];
    expect(stored?.processedAt).toBeTruthy();
    await opened.close();
  });
});
