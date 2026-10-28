import { describe, expect, it } from "vitest";
import { contractPlanCopy, planIsAccepted } from "./contract-plan";

describe("contract plan", () => {
  it("shows not accepted yet when there is no accepted version", () => {
    expect(planIsAccepted([])).toBe(false);
    expect(planIsAccepted([{ status: "draft" }])).toBe(false);
    expect(contractPlanCopy(false)).toContain("not accepted yet");
    expect(planIsAccepted([{ status: "accepted" }])).toBe(true);
    expect(contractPlanCopy(true)).toContain("locked");
  });
});
