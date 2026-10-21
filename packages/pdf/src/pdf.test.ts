import { describe, expect, it } from "vitest";
import { blankLetterhead, changeLogLines, renderOnLetterhead } from "./letterhead.js";

describe("letterhead", () => {
  it("draws a certificate onto two sample letterheads", async () => {
    for (const kind of ["band", "rule"] as const) {
      const template = await blankLetterhead(kind);
      const pdf = await renderOnLetterhead({
        template,
        marginTop: 96,
        marginBottom: 72,
        title: "Interim payment certificate",
        qrUrl: "https://example.invalid/tx/0xabc",
        blocks: [
          { heading: "EM 22", lines: ["This certificate ₦1,350,000", "Net payable 1,282,500 kobo equivalent", "Tx 0xabc"] },
          { lines: changeLogLines([{ type: "new_stage", status: "pending", reason: "Extra soakaway", responseHours: null }]) },
        ],
      });
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(template.byteLength);
    }
  });
});
