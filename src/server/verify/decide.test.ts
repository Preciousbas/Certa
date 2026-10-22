import { describe, expect, it } from "vitest";
import { decide, type DecideInput } from "./decide.js";

function row(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    verdict: "pass",
    confidence: 0.86,
    requiredCriteriaMet: true,
    observedStage: 4,
    claimedStage: 4,
    possibleFake: false,
    photoChecksOk: true,
    safetyFlags: [],
    threshold: 0.75,
    ...overrides,
  };
}

describe("verify decision table", () => {
  it("passes at 0.75 and holds at 0.749", () => {
    expect(decide(row({ confidence: 0.75 })).next).toBe("awaiting_certification");
    expect(decide(row({ confidence: 0.749 })).next).toBe("needs_more_evidence");
  });

  it("fails at 0.6 and asks for more evidence at 0.599", () => {
    expect(decide(row({ verdict: "fail", confidence: 0.6 })).next).toBe("ai_fail");
    expect(decide(row({ verdict: "fail", confidence: 0.599 })).next).toBe("needs_more_evidence");
  });

  it("sends unsure, a stage mismatch, a fake flag, or a failed photo check to more evidence", () => {
    expect(decide(row({ verdict: "unsure", confidence: 0.95 })).next).toBe("needs_more_evidence");
    expect(decide(row({ observedStage: 2 })).next).toBe("needs_more_evidence");
    expect(decide(row({ possibleFake: true })).next).toBe("needs_more_evidence");
    expect(decide(row({ photoChecksOk: false })).next).toBe("needs_more_evidence");
    expect(decide(row({ requiredCriteriaMet: false })).next).toBe("needs_more_evidence");
  });

  it("notifies both sides on a pass and does not change state for a safety flag", () => {
    const pass = decide(row());
    expect(pass.notices).toEqual(["B-VF-1", "B-VF-2", "B-VF-3"]);
    const flagged = decide(row({ safetyFlags: ["No edge protection on the slab."] }));
    expect(flagged.next).toBe("awaiting_certification");
    expect(flagged.notices).toContain("B-VF-7");
    const failed = decide(row({ verdict: "fail", confidence: 0.8, safetyFlags: ["Workers without helmets."] }));
    expect(failed.next).toBe("ai_fail");
    expect(failed.notices).toEqual(["B-VF-4", "consultant_fyi", "B-VF-7"]);
  });

  it("asks the contractor and the consultant when the check is not sure", () => {
    expect(decide(row({ verdict: "unsure", confidence: 0.4 })).notices).toEqual(["B-VF-5", "B-VF-6"]);
  });
});
