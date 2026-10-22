import { PDFParse } from "pdf-parse";
import { describe, expect, it } from "vitest";
import { renderPaymentCertificate } from "./certificate.js";

describe("payment certificate", () => {
  it("includes the transaction hash and a QR image", async () => {
    const txHash = "0xabc123def456abc123def456abc123def456abc123def456abc123def456abcd";
    const pdf = await renderPaymentCertificate({
      certificateNo: "PC-1",
      project: "North wing",
      parties: "Client / Contractor",
      stage: "1. Slab",
      gross: "NGN 100.00",
      retention: "NGN 5.00",
      net: "NGN 95.00",
      cumulative: "NGN 95.00",
      fxLine: "NGN 1.00 per USDC, set 1 Jan 2026",
      txHash,
      explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
      consultant: "Consultant, 1 Jan 2026, 12:00 WAT",
      clientApproval: "Client, 1 Jan 2026, 12:05 WAT",
    });
    const parsed = await new PDFParse({ data: Buffer.from(pdf) }).getText();
    expect(parsed.text).toContain(txHash);
    expect(Buffer.from(pdf).toString("latin1")).toContain("/Image");
  });
});
