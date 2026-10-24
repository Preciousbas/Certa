import { describe, expect, it } from "vitest";
import { drainAfterHandler } from "./schedule";

describe("drainAfterHandler", () => {
  it("waits until the handler finishes before draining", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const handler = new Promise<void>((resolve) => {
      release = () => {
        order.push("handler");
        resolve();
      };
    });
    const done = drainAfterHandler(handler, async () => {
      order.push("drain");
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await done;
    expect(order).toEqual(["handler", "drain"]);
  });

  it("still drains when the handler fails", async () => {
    const order: string[] = [];
    await drainAfterHandler(Promise.reject(new Error("reply failed")), async () => {
      order.push("drain");
    });
    expect(order).toEqual(["drain"]);
  });
});
