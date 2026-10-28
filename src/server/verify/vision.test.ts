import { describe, expect, it } from "vitest";
import { askChecklist, type VisionClient, type VisionRequest } from "./vision.js";

const reply = JSON.stringify({
  schema_version: "3",
  stage_number_claimed: 1,
  items: [{ id: "c1", answer: "yes", reason: "Seen in the foreground." }],
});

async function capture(longSide?: number): Promise<VisionRequest> {
  let seen: VisionRequest | undefined;
  const client: VisionClient = async (input) => {
    seen = input;
    return { text: reply, latencyMs: 1, costMicro: null };
  };
  await askChecklist({
    system: "system",
    user: "user",
    images: [new Uint8Array([1])],
    model: "test-model",
    client,
    longSide,
  });
  if (!seen) throw new Error("The vision client was not called.");
  return seen;
}

describe("askChecklist photo size", () => {
  it("passes the photo size to the vision client", async () => {
    const seen = await capture(1568);
    expect(seen.longSide).toBe(1568);
  });

  it("leaves the photo size unset by default", async () => {
    const seen = await capture();
    expect(seen.longSide).toBeUndefined();
  });
});
