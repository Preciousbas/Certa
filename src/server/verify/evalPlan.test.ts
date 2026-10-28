import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evalFileStem, labelErrors, parseEvalArgs, plannedCalls } from "./evalPlan.js";

describe("photo checklist eval plan", () => {
  it("defaults to six photos at 1024 without v2 or a run", () => {
    expect(parseEvalArgs([])).toEqual({
      model: null,
      limit: 6,
      longSide: 1024,
      withV2: false,
      run: false,
    });
  });

  it("rejects a limit of 0 or 21 and a long side of 2000", () => {
    expect(() => parseEvalArgs(["--limit", "0"])).toThrow(/1 to 20/);
    expect(() => parseEvalArgs(["--limit", "21"])).toThrow(/1 to 20/);
    expect(() => parseEvalArgs(["--long-side", "2000"])).toThrow(/1024 or 1568/);
  });

  it("counts two calls per photo, or three when v2 is included", () => {
    expect(plannedCalls(6, false)).toBe(12);
    expect(plannedCalls(6, true)).toBe(18);
  });

  it("cleans a model id that has a slash or spaces", () => {
    expect(evalFileStem("2026-10-28", "gpt-6.1-sol", 1024)).toBe(
      "checklist-2026-10-28-gpt-6.1-sol-1024",
    );
    expect(evalFileStem("2026-10-28", "openai/gpt 6", 1568)).toBe(
      "checklist-2026-10-28-openai-gpt-6-1568",
    );
  });

  it("flags a duplicate file, a stage of 11, and a should_verdict of maybe", () => {
    const errors = labelErrors([
      { file: "a.jpg", claimed_stage: 2, should_verdict: "fail" },
      { file: "a.jpg", claimed_stage: 11, should_verdict: "maybe" },
    ]);
    const text = errors.join("\n");
    expect(text).toContain("duplicate file a.jpg");
    expect(text).toContain("claimed_stage 11");
    expect(text).toContain("should_verdict maybe");
  });

  it("the tracked real labels are valid", () => {
    const labels = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "tests/fixtures/stage-photos/real/labels.json"),
        "utf8",
      ),
    ) as unknown;
    expect(labelErrors(labels)).toEqual([]);
  });
});
