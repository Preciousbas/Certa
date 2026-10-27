import { describe, expect, it } from "vitest";
import { canTransition, IllegalTransition, STAGE_STATUSES, type StageStatus } from "./transition";

const LEGAL: Array<[StageStatus, StageStatus]> = [
  ["not_started", "in_progress"],
  ["not_started", "cancelled"],
  ["in_progress", "submitted"],
  ["in_progress", "disputed"],
  ["submitted", "ai_review"],
  ["submitted", "disputed"],
  ["ai_review", "ai_fail"],
  ["ai_review", "needs_more_evidence"],
  ["ai_review", "awaiting_certification"],
  ["ai_review", "awaiting_client_approval"],
  ["ai_review", "disputed"],
  ["ai_fail", "submitted"],
  ["ai_fail", "disputed"],
  ["needs_more_evidence", "submitted"],
  ["needs_more_evidence", "disputed"],
  ["awaiting_certification", "awaiting_client_approval"],
  ["awaiting_certification", "in_progress"],
  ["awaiting_certification", "disputed"],
  ["awaiting_client_approval", "approved"],
  ["awaiting_client_approval", "in_progress"],
  ["awaiting_client_approval", "disputed"],
  ["approved", "releasing"],
  ["releasing", "released"],
  ["releasing", "release_failed"],
  ["release_failed", "releasing"],
  ["disputed", "in_progress"],
  ["disputed", "approved"],
];

describe("stage transitions", () => {
  it("allows every edge in the product table and no other pair", () => {
    const allowed = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of STAGE_STATUSES) {
      for (const to of STAGE_STATUSES) {
        const legal = allowed.has(`${from}->${to}`);
        expect(canTransition(from, to)).toBe(legal);
        if (!legal) {
          expect(() => {
            if (!canTransition(from, to)) throw new IllegalTransition(from, to);
          }).toThrow(IllegalTransition);
        }
      }
    }
  });
});
