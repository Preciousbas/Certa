import { describe, expect, it } from "vitest";
import { documentChip, documentOpenForResend } from "./status.js";

describe("document status", () => {
  it("uses the same labels for a bot upload and a web row", () => {
    const row = { id: "doc-1", fileName: "sample-boq.xlsx", status: "uploaded", parseStatus: "pending" };
    expect(documentChip(row).status).toBe("Reading");
    expect(documentChip(row).retry).toBe(true);
    expect(documentChip({ ...row, status: "parsed", parseStatus: "parsed" }).retry).toBe(false);
    expect(documentChip({ ...row, status: "failed", parseStatus: "failed" }).status).toBe("Failed");
  });

  it("lets a failed or never-processed file be sent again", () => {
    expect(documentOpenForResend({ status: "failed", parseStatus: "failed" })).toBe(true);
    expect(documentOpenForResend({ status: "uploaded", parseStatus: "pending" })).toBe(true);
    expect(documentOpenForResend({ status: "parsed", parseStatus: "parsed" })).toBe(false);
  });
});
