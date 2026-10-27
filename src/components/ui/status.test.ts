import { describe, expect, it } from "vitest";
import { stageChip } from "./status.js";

describe("stage chips", () => {
  it("uses the product labels", () => {
    expect(stageChip("not_started")).toEqual({ label: "Not started", tone: "neutral" });
    expect(stageChip("in_progress").label).toBe("In progress");
    expect(stageChip("submitted").label).toBe("Checking photos");
    expect(stageChip("ai_review").label).toBe("Checking photos");
    expect(stageChip("ai_fail").label).toBe("Needs work");
    expect(stageChip("needs_more_evidence").label).toBe("More photos needed");
    expect(stageChip("awaiting_certification").label).toBe("Waiting for consultant");
    expect(stageChip("awaiting_client_approval").label).toBe("Waiting for the client");
    expect(stageChip("approved").label).toBe("Paying");
    expect(stageChip("releasing").label).toBe("Paying");
    expect(stageChip("released")).toEqual({ label: "Released", tone: "success" });
    expect(stageChip("release_failed").label).toBe("Payment retrying");
    expect(stageChip("disputed").tone).toBe("danger");
    expect(stageChip("cancelled").label).toBe("Cancelled");
    expect(stageChip("funded").label).toBe("Not started");
  });
});
