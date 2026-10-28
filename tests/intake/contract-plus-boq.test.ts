import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBytes } from "../../src/server/intake/parse.js";
import { planFromRows } from "../../src/server/intake/read.js";
import { blockCRows } from "./fixtures/lekki-blocks.js";

const RATE = 150_000n;
const FIVE = new TextEncoder().encode(readFileSync(new URL("../fixtures/contracts/five_stage_contract.txt", import.meta.url)));
const MATCHING = new TextEncoder().encode(`Client: Genius
Contractor: Precious
Contract Sum: N12,000.00
Stage 1 - Substructure: N4,000.00
Stage 2 - Ground floor frame and blockwork: N4,000.00
Stage 3 - Roof: N4,000.00
`);

describe("contract and BoQ together", () => {
  it("keeps the contract schedule and warns when the BoQ total differs", async () => {
    const contract = await parseBytes("five.txt", FIVE);
    expect(contract.ok).toBe(true);
    if (!contract.ok) return;
    const plan = planFromRows([contract.document.rows, blockCRows], RATE).plan;
    expect(plan.stages.filter((stage) => stage.kind !== "reserve")).toHaveLength(5);
    expect(plan.contractSumKobo).toBe(1_000_000_000n);
    expect(plan.basis).toBe("contract_milestones");
    const mismatch = plan.issues.find((issue) => issue.code === "V19");
    expect(mismatch?.message).toBe(
      "The BoQ adds up to ₦12,000.00 but the contract sum is ₦10,000,000.00 (difference ₦9,988,000.00). Certa used the contract's payment schedule for the stages. Check this before you send the plan.",
    );
    expect(plan.issues.some((issue) => issue.code === "V04")).toBe(false);
  });

  it("links each bill to the matching contract stage when the sums agree", async () => {
    const contract = await parseBytes("match.txt", MATCHING);
    expect(contract.ok).toBe(true);
    if (!contract.ok) return;
    const plan = planFromRows([contract.document.rows, blockCRows], RATE).plan;
    expect(plan.issues.some((issue) => issue.code === "V19")).toBe(false);
    expect(plan.stages.map((stage) => [stage.name, stage.amountKobo, stage.itemIds.length, stage.boqKobo])).toEqual([
      ["Substructure", 400_000n, 2, 400_000n],
      ["Ground floor frame and blockwork", 400_000n, 2, 400_000n],
      ["Roof", 400_000n, 2, 400_000n],
    ]);
  });
});
