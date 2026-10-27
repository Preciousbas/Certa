import { describe, expect, it } from "vitest";
import { sniffDocument } from "./boq.js";

describe("bill of quantities", () => {
  it("recognises a pdf and refuses a random file", () => {
    expect(sniffDocument("bill.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("pdf");
    expect(sniffDocument("notes.bin", new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
