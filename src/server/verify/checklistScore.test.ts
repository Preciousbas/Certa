import { describe, expect, it } from "vitest";
import { alignAnswers, agreeChecklistRuns, combineChecklistRuns, scoreChecklist, type ItemAnswer } from "./checklistScore.js";

function item(id: string, answer: ItemAnswer["answer"], reason: string): ItemAnswer {
  return { id, answer, reason };
}

const four = (answers: ItemAnswer["answer"][], reason = "The frame shows this clearly."): ItemAnswer[] =>
  answers.map((answer, index) => item(`c${index + 1}`, answer, answer === "no" ? reason : "Seen in the photo."));

describe("checklist score", () => {
  it("passes at 0.75 when three of four are yes and none is no", () => {
    const score = scoreChecklist(four(["yes", "yes", "yes", "cannot_see"]));
    expect(score.confidence).toBe(0.75);
    expect(score.verdict).toBe("pass");
    expect(score.next).toBe("awaiting_certification");
  });

  it("holds below 0.75 when two of four cannot be seen", () => {
    const score = scoreChecklist(four(["yes", "yes", "cannot_see", "cannot_see"]));
    expect(score.confidence).toBe(0.5);
    expect(score.verdict).toBe("unsure");
    expect(score.next).toBe("needs_more_evidence");
  });

  it("fails on a no with a clear reason even when three items are yes", () => {
    const score = scoreChecklist(four(["yes", "yes", "yes", "no"], "The bars are still bare."));
    expect(score.confidence).toBe(0.75);
    expect(score.verdict).toBe("fail");
    expect(score.next).toBe("ai_fail");
  });

  it("does not fail a no that has no clear reason, and does not pass it", () => {
    const score = scoreChecklist(four(["yes", "yes", "yes", "no"], "no"));
    expect(score.verdict).toBe("unsure");
    expect(score.next).toBe("needs_more_evidence");
  });

  it("fills a skipped checklist item as cannot_see", () => {
    const aligned = alignAnswers(
      [
        { id: "s2-trench", text: "trench" },
        { id: "s2-concrete", text: "concrete" },
      ],
      [item("s2-trench", "yes", "The trench is open.")],
    );
    expect(aligned[1]).toMatchObject({ id: "s2-concrete", answer: "cannot_see" });
    expect(scoreChecklist(aligned).verdict).toBe("unsure");
  });

  it("passes only when both runs pass", () => {
    const pass = scoreChecklist(four(["yes", "yes", "yes", "yes"]));
    const fail = scoreChecklist(four(["yes", "yes", "yes", "no"], "No concrete on the bars."));
    const unsure = scoreChecklist(four(["yes", "cannot_see", "cannot_see", "cannot_see"]));
    expect(combineChecklistRuns(pass, pass).verdict).toBe("pass");
    expect(combineChecklistRuns(pass, fail).verdict).toBe("fail");
    expect(combineChecklistRuns(fail, pass).next).toBe("ai_fail");
    expect(combineChecklistRuns(pass, unsure).verdict).toBe("unsure");
    expect(combineChecklistRuns(fail, unsure).verdict).toBe("fail");
  });

  it("does not pass when one of the two runs is missing", () => {
    const pass = scoreChecklist(four(["yes", "yes", "yes", "yes"]));
    const fail = scoreChecklist(four(["no", "no", "no", "no"], "The footing is not in frame."));
    expect(agreeChecklistRuns(pass, null).verdict).toBe("unsure");
    expect(agreeChecklistRuns(null, fail).verdict).toBe("fail");
    expect(agreeChecklistRuns(null, null).next).toBe("needs_more_evidence");
  });
});
