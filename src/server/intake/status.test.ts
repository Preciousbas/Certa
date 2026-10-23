import { describe, expect, it } from "vitest";
import { documentChip } from "./status.js";

describe("document status", () => {
  it("uses the same labels for a bot upload and a web row", () => {
    const row = { id: "doc-1", fileName: "sample-boq.xlsx", status: "uploaded", parseStatus: "pending" };
    expect(documentChip(row).status).toBe("Reading");
    expect(documentChip({ ...row, status: "parsed", parseStatus: "parsed" }).status).toBe("Read");
    expect(documentChip({ ...row, status: "failed", parseStatus: "failed" }).status).toBe("Failed");
  });
});
