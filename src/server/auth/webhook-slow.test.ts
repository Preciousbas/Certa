import { createMemoryDatabase, jobs, telegramUpdates } from "@certa/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { acceptTelegramUpdate } from "./webhook.js";

function update(id: number) {
  return new Request("http://localhost/api/telegram", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "webhook-test-secret",
    },
    body: JSON.stringify({ update_id: id, message: { text: "hello" } }),
  });
}

describe("slow telegram update", () => {
  it("marks the queued job done when the original handler finishes", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-test-secret";
    const opened = await createMemoryDatabase();
    try {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let slow = Promise.resolve();
      const response = await acceptTelegramUpdate(update(11), {
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
    } finally {
      await opened.close();
    }
  });
});
