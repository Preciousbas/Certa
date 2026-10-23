import { disputes, getDatabase, projects, seedDemo } from "@certa/db";
import { nairaToKobo, usdcFromNgnKobo, fxRateFromNaira } from "@certa/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { changeSummary, formatPayBps, stageStatusLabel } from "./labels";

delete process.env.DATABASE_URL;

describe("labels", () => {
  it("does not echo database status words", () => {
    expect(stageStatusLabel("submitted")).toBe("Checking photos");
    expect(stageStatusLabel("released")).toBe("Released");
    expect(stageStatusLabel("funded")).toBe("Not started");
    expect(stageStatusLabel("mystery")).toBe("Not started");
  });

  it("reads a new stage as naira and USDC at the project rate", () => {
    const rate = fxRateFromNaira(1500n);
    const summary = changeSummary("new_stage", { name: "Extra soakaway", amountNgnKobo: nairaToKobo(900_000n).toString() }, rate);
    expect(summary?.title).toBe("New stage: Extra soakaway");
    expect(summary ? usdcFromNgnKobo(BigInt(summary.kobo), rate).toString() : "").toBe(summary?.usdc);
  });

  it("refuses a change it cannot read", () => {
    expect(changeSummary("new_stage", { raw: true }, fxRateFromNaira(1500n))).toBeNull();
  });

  it("seeds the released-in-full dispute at 10000 basis points and shows 100%", async () => {
    const db = await getDatabase();
    await seedDemo(db);
    const project = (await db.select().from(projects)).find((row) => row.termsHash === "seeded-terms");
    if (!project) throw new Error("sample project missing");
    const dispute = (await db.select().from(disputes).where(eq(disputes.projectId, project.id)))[0];
    if (!dispute) throw new Error("seeded dispute missing");
    const resolution = dispute.resolution as { note?: string; payBps?: number };
    expect(resolution.note).toBe("Released in full");
    expect(resolution.payBps).toBe(10000);
    expect(formatPayBps(resolution.payBps)).toBe("100%");
    expect(formatPayBps(Number.NaN)).toBeNull();
  });
});
