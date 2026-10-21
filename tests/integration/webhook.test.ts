import { createMemoryDatabase } from "@certa/db";
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
});
